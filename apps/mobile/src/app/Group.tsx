import { GroupScreen } from "../screens/Group";
import { useScreen } from "../navigation";
export default function Route() {
  return <GroupScreen {...useScreen<"Group">()} />;
}
