import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Logger } from "@matter/general";

const logger = Logger.get("PluginInstaller");

// Validate package name to prevent command injection
const VALID_PACKAGE_RE =
  /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[^@\s]+)?$/;

export interface InstallResult {
  success: boolean;
  packageName: string;
  version?: string;
  error?: string;
}

/**
 * Installs/uninstalls npm packages into a dedicated plugin directory
 * inside the HAMH storage location.
 */
export class PluginInstaller {
  private readonly pluginDir: string;

  constructor(storageLocation: string) {
    this.pluginDir = path.join(storageLocation, "plugin-packages");
    this.ensurePluginDir();
  }

  get installDir(): string {
    return this.pluginDir;
  }

  private ensurePluginDir(): void {
    if (!fs.existsSync(this.pluginDir)) {
      fs.mkdirSync(this.pluginDir, { recursive: true });
    }
    // Ensure a package.json exists so npm install works
    const pkgJson = path.join(this.pluginDir, "package.json");
    if (!fs.existsSync(pkgJson)) {
      fs.writeFileSync(
        pkgJson,
        JSON.stringify(
          {
            name: "hamh-plugins",
            version: "1.0.0",
            private: true,
            description: "HAMH installed plugins",
          },
          null,
          2,
        ),
      );
    }
  }

  async install(packageName: string): Promise<InstallResult> {
    if (!VALID_PACKAGE_RE.test(packageName)) {
      return {
        success: false,
        packageName,
        error: `Invalid package name: "${packageName}"`,
      };
    }

    logger.info(`Installing plugin: ${packageName}`);

    return new Promise((resolve) => {
      execFile(
        "npm",
        ["install", packageName, "--save"],
        {
          cwd: this.pluginDir,
          timeout: 120_000,
          env: { ...process.env, NODE_ENV: "production" },
        },
        (error, _stdout, stderr) => {
          if (error) {
            logger.error(
              `Failed to install ${packageName}:`,
              stderr || error.message,
            );
            resolve({
              success: false,
              packageName,
              error: stderr || error.message,
            });
            return;
          }

          // Try to read the installed version
          const version = this.getInstalledVersion(packageName);
          logger.info(
            `Successfully installed ${packageName}@${version || "unknown"}`,
          );
          resolve({
            success: true,
            packageName,
            version: version ?? undefined,
          });
        },
      );
    });
  }

  async uninstall(packageName: string): Promise<InstallResult> {
    if (!VALID_PACKAGE_RE.test(packageName)) {
      return {
        success: false,
        packageName,
        error: `Invalid package name: "${packageName}"`,
      };
    }

    logger.info(`Uninstalling plugin: ${packageName}`);

    return new Promise((resolve) => {
      execFile(
        "npm",
        ["uninstall", packageName, "--save"],
        {
          cwd: this.pluginDir,
          timeout: 60_000,
        },
        (error, _stdout, stderr) => {
          if (error) {
            logger.error(
              `Failed to uninstall ${packageName}:`,
              stderr || error.message,
            );
            resolve({
              success: false,
              packageName,
              error: stderr || error.message,
            });
            return;
          }
          logger.info(`Successfully uninstalled ${packageName}`);
          resolve({ success: true, packageName });
        },
      );
    });
  }

  /**
   * Get the resolved path to a plugin's main entry point.
   * This is used by PluginManager.loadExternal() to import the plugin.
   */
  getPluginPath(packageName: string): string {
    return path.join(this.pluginDir, "node_modules", packageName);
  }

  /**
   * List all installed plugin packages from the plugin directory's package.json.
   */
  listInstalled(): Array<{ name: string; version: string }> {
    try {
      const pkgJson = path.join(this.pluginDir, "package.json");
      if (!fs.existsSync(pkgJson)) return [];
      const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf-8"));
      const deps = pkg.dependencies ?? {};
      return Object.entries(deps).map(([name, ver]) => ({
        name,
        version: this.getInstalledVersion(name) ?? String(ver),
      }));
    } catch {
      return [];
    }
  }

  private getInstalledVersion(packageName: string): string | null {
    try {
      const pkgPath = path.join(
        this.pluginDir,
        "node_modules",
        packageName,
        "package.json",
      );
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        return pkg.version ?? null;
      }
    } catch {
      // ignore
    }
    return null;
  }
}
