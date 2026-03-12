import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "index",
    {
      type: "category",
      label: "Getting Started",
      items: [
        "getting-started/installation",
        "getting-started/bridge-configuration",
      ],
    },
    {
      type: "category",
      label: "Guides",
      items: [
        "guides/alpha-features",
        "guides/testing-features",
        "guides/api-reference",
        "guides/migration-from-t0bst4r",
        "guides/connectivity-issues",
        "guides/connect-multiple-fabrics",
        "guides/reverse-proxy",
        "guides/plugin-system",
      ],
    },
    "supported-device-types",
    {
      type: "category",
      label: "Devices",
      items: [
        "devices/light",
        "devices/climate",
        "devices/cover",
        "devices/lock",
        "devices/robot-vacuum",
        "devices/air-purifier",
        "devices/temperature-humidity-sensor",
      ],
    },
    "faq",
    {
      type: "category",
      label: "Developer Documentation",
      items: [
        "developer/index",
        "developer/services",
        "developer/endpoints",
        "developer/behaviors",
      ],
    },
  ],
};

export default sidebars;
