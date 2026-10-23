import { Redirect } from "expo-router";
import { useStore } from "../core/store";
export default function Index() {
  const { session } = useStore();
  return <Redirect href={session ? "/Home" : "/login"} />;
}
