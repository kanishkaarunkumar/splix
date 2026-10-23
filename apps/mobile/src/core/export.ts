import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
export async function shareCsv(csv: string, month: string) {
  const filename = `splix-${month.replace(/[^0-9-]/g, "")}.csv`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing is unavailable on this device.");
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(csv);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      dialogTitle: "Share your Splix report",
      UTI: "public.comma-separated-values-text",
    });
  } finally {
    file.delete();
  }
}
