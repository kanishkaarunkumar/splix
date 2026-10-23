import { ReportScreen } from "../screens/Report";
import { useScreen } from "../navigation";
export default function Route() {
  return <ReportScreen {...useScreen<"Report">()} />;
}
