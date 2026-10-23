import { Home } from "../screens/Home";
import { useScreen } from "../navigation";
export default function Route() {
  return <Home {...useScreen<"Home">()} />;
}
