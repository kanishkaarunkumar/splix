import { InboxScreen } from "../../screens/Capture";
import { useScreen } from "../../navigation";
export default function Review() {
  const props = useScreen<"Inbox">();
  const id = props.route.params?.draftId;
  const params =
    id && !/^[a-zA-Z0-9-]{1,128}$/.test(id)
      ? { draftId: "invalid" }
      : props.route.params;
  return <InboxScreen {...props} route={{ params }} />;
}
