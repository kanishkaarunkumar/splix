import { MembersScreen } from "../screens/Members";
import { useScreen } from "../navigation";
export default function Route() {
  return <MembersScreen {...useScreen<"Members">()} />;
}
