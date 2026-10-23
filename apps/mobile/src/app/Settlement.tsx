import { SettlementScreen } from "../screens/Settlement";
import { useScreen } from "../navigation";
export default function Route() {
  return <SettlementScreen {...useScreen<"Settlement">()} />;
}
