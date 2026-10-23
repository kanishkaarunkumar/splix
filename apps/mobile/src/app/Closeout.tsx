import { CloseoutScreen } from "../screens/Closeout";
import { useScreen } from "../navigation";
export default function Route() {
  return <CloseoutScreen {...useScreen<"Closeout">()} />;
}
