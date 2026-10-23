import { ExpenseScreen } from "../screens/Expense";
import { useScreen } from "../navigation";
export default function Route() {
  return <ExpenseScreen {...useScreen<"Expense">()} />;
}
