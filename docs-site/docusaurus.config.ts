import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Home Assistant Matter Hub",
  tagline: "Expose Home Assistant devices as Matter devices",
  favicon: "img/hamh-logo-small.png",

  url: "https://riddix.github.io",
  baseUrl: "/home-assistant-matter-hub/",

  organizationName: "riddix",
  projectName: "home-assistant-matter-hub",

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/",
          editUrl:
            "https://github.com/riddix/home-assistant-matter-hub/tree/main/docs-site/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/hamh-logo-large.png",
    navbar: {
      title: "Home Assistant Matter Hub",
      logo: {
        alt: "HAMH Logo",
        src: "img/hamh-logo-small.png",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Documentation",
        },
        {
          href: "https://github.com/riddix/home-assistant-matter-hub",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Getting Started", to: "/getting-started/installation" },
            { label: "Guides", to: "/guides/plugin-system" },
            { label: "Devices", to: "/devices/light" },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "GitHub Issues",
              href: "https://github.com/riddix/home-assistant-matter-hub/issues",
            },
            {
              label: "GitHub Discussions",
              href: "https://github.com/riddix/home-assistant-matter-hub/discussions",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Home Assistant Matter Hub`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
