const fs = require("node:fs/promises");
const path = require("node:path");
const {
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
} = require("expo/config-plugins");

module.exports = (config) => {
  config = withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (entry) => entry.key !== "android.minSdkVersion",
    );
    config.modResults.push({
      type: "property",
      key: "android.minSdkVersion",
      value: "27",
    });
    return config;
  });
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.$["android:allowBackup"] = "false";
    app.$["android:fullBackupContent"] = "false";
    if (process.env.SPLIX_LOCAL_ANDROID_TEST === "1") {
      app.$["android:networkSecurityConfig"] =
        "@xml/splix_test_network_security";
    } else {
      delete app.$["android:networkSecurityConfig"];
    }
    return config;
  });
  if (process.env.SPLIX_LOCAL_ANDROID_TEST === "1") {
    config = withDangerousMod(config, ["android", async (config) => {
      const directory = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(
        path.join(directory, "splix_test_network_security.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain>127.0.0.1</domain>
    <domain>localhost</domain>
    <domain>10.0.2.2</domain>
  </domain-config>
</network-security-config>
`,
      );
      return config;
    }]);
  }
  return config;
};
