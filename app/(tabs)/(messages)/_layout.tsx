import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function MessagesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: "700" as const },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "MeshCore" }}
      />
      <Stack.Screen
        name="[chatId]"
        options={{ title: "" }}
      />
    </Stack>
  );
}
