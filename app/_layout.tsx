import { PaperProvider } from "react-native-paper";
import Index from "./index";
export default function RootLayout() {
  return (
    <PaperProvider>
      <Index />
    </PaperProvider>
  );
}
