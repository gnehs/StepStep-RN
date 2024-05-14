import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View } from "react-native";
import {
  TextInput,
  Text,
  Button,
  useTheme,
  Card,
  Appbar,
} from "react-native-paper";

import {
  initialize,
  requestPermission,
  readRecords,
} from "react-native-health-connect";
import { Alert } from "react-native";
export default function Index() {
  const theme = useTheme();
  // Sync
  const [syncValue, setSyncValue] = useState("");
  useEffect(() => {
    fetchSyncURL();
  }, []);
  useEffect(() => {
    if (syncValue === "") return;
    updateSyncURL();
  }, [syncValue]);
  async function fetchSyncURL() {
    setSyncValue((await AsyncStorage.getItem("sync-api-url")) ?? "");
  }
  async function updateSyncURL() {
    await AsyncStorage.setItem("sync-api-url", syncValue);
  }
  async function sync() {
    // verify the URL
    let url;
    console.log(syncValue);
    try {
      url = new URL(syncValue);
    } catch (e) {
      Alert.alert("錯誤", "請輸入合法的網址！");
      return;
    }

    // sync the data
    await readSampleData();
  }
  const readSampleData = async () => {
    // initialize the client
    const isInitialized = await initialize();
    console.log("initialized", isInitialized);

    // request permissions
    const grantedPermissions = await requestPermission([
      { accessType: "read", recordType: "Distance" },
      { accessType: "read", recordType: "Steps" },
      { accessType: "read", recordType: "ActiveCaloriesBurned" },
    ]);
    console.log(grantedPermissions);

    // check if granted
    const now = new Date();
    const past = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
    const result = await readRecords("ActiveCaloriesBurned", {
      timeRangeFilter: {
        operator: "between",
        startTime: past.toISOString(),
        endTime: now.toISOString(),
      },
    });
    console.log(result);
  };
  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="餅餅踏踏" />
      </Appbar.Header>
      <View
        className="px-4 flex flex-col gap-2 h-full"
        style={{ backgroundColor: theme.colors.surface }}
      >
        <Text variant="bodyLarge">
          歡迎來到餅餅踏踏！在下方輸入您的同步網址，並同意授權後便可開啟自動同步了！
        </Text>
        <Card>
          <Card.Content>
            <Text variant="titleLarge">同步</Text>
            <Text variant="bodyMedium">
              我們會向你請求健康資料的權限，並將資料同步到您的伺服器上。
            </Text>
            <TextInput
              className="mt-2"
              label="同步網址"
              value={syncValue}
              onChangeText={setSyncValue}
            />
          </Card.Content>
          <Card.Actions>
            <Button mode="contained" onPress={sync}>
              同步
            </Button>
          </Card.Actions>
        </Card>
      </View>
    </>
  );
}
