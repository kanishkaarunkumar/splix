import { CaptureScreen } from "../screens/Capture";
import { useScreen } from "../navigation";
export default function Route() {
  return <CaptureScreen {...useScreen<"Capture">()} />;
}
