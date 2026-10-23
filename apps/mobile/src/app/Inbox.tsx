import { InboxScreen } from "../screens/Capture";
import { useScreen } from "../navigation";
export default function Route() {
  return <InboxScreen {...useScreen<"Inbox">()} />;
}
