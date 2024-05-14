import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ScrollView } from "react-native";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
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
  aggregateRecord,
} from "react-native-health-connect";
import { Alert } from "react-native";

const BACKGROUND_FETCH_TASK = "background-fetch";
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  const now = Date.now();

  console.log(
    `Got background fetch call at date: ${new Date(now).toISOString()}`
  );
  await syncData(1);
  await AsyncStorage.setItem("last-auto-sync", new Date().toLocaleString());
  // Be sure to return the successful result type!
  return BackgroundFetch.BackgroundFetchResult.NewData;
});
async function registerBackgroundFetchAsync() {
  return BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
    minimumInterval: 60, // 15 minutes
    stopOnTerminate: true, // android only,
    startOnBoot: true, // android only
  });
}
async function unregisterBackgroundFetchAsync() {
  return BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
}
const syncData = async (
  days: number,
  logger: (message: string) => void = console.log
) => {
  const syncURL = (await AsyncStorage.getItem("sync-api-url")) ?? "";
  // initialize the client
  logger("正在初始化...");
  await initialize();

  // request permissions
  logger("正在請求權限...");
  await requestPermission([
    { accessType: "read", recordType: "Distance" },
    { accessType: "read", recordType: "Steps" },
    { accessType: "read", recordType: "ActiveCaloriesBurned" },
  ]);
  // get past 7 days and aggregate the data by hour
  const tasks = days * 24;
  const now = new Date();
  const past = new Date(now.getTime() - tasks * 60 * 60 * 1000);
  // set minutes & seconds to 0
  past.setMinutes(0);
  past.setSeconds(0);
  past.setMilliseconds(0);
  let result: {
    distance: string[];
    step: string[];
    time: string[];
    energy: string[];
  } = {
    distance: [],
    step: [],
    time: [],
    energy: [],
  };
  for (let i = 0; i < tasks; i++) {
    logger(`正在取得第 ${i + 1}/${tasks} 筆資料...`);
    const startTime = new Date(past.getTime() + i * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    const distanceResult = await aggregateRecord({
      recordType: "Distance",
      timeRangeFilter: {
        operator: "between",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });
    const stepsResult = await aggregateRecord({
      recordType: "Steps",
      timeRangeFilter: {
        operator: "between",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });
    const activeCaloriesBurnedResult = await aggregateRecord({
      recordType: "ActiveCaloriesBurned",
      timeRangeFilter: {
        operator: "between",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });
    result.distance.push(distanceResult.DISTANCE.inKilometers.toString());
    result.step.push(stepsResult.COUNT_TOTAL.toString());
    result.time.push(startTime.toISOString());
    result.energy.push(
      activeCaloriesBurnedResult.ACTIVE_CALORIES_TOTAL.inKilocalories.toString()
    );
  }
  console.log("time:", new Date().getTime() - now.getTime(), "ms");
  console.log(`Syncing ${days} days data...`);
  logger(`正在傳送資料...`);
  const syncResult = await fetch(syncURL, {
    method: "POST",
    headers: {
      Accept: "text/plain",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(result),
  }).then((res) => res.text());
  logger(syncResult);
  return syncResult;
};
export default function Index() {
  const theme = useTheme();
  // Sync
  const [syncValue, setSyncValue] = useState("");
  const [lastAutoSync, setLastAutoSync] = useState("");
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState("");
  useEffect(() => {
    fetchSyncData();
  }, []);
  useEffect(() => {
    if (syncValue === "") return;
    updateSyncURL();
  }, [syncValue]);
  async function fetchSyncData() {
    setSyncValue((await AsyncStorage.getItem("sync-api-url")) ?? "");
    setLastAutoSync((await AsyncStorage.getItem("last-auto-sync")) ?? "");
  }
  async function updateSyncURL() {
    await AsyncStorage.setItem("sync-api-url", syncValue);
  }
  async function handleSyncButtonClick(days: number = 1) {
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
    setLoading(true);
    let syncResult = await syncData(days, (message) => {
      setLog((log) => message + "\n" + log);
    });
    setLoading(false);
    await registerBackgroundFetchAsync();
    Alert.alert("同步成功", syncResult);
  }

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
              我們會向你請求健康資料的權限，並將資料同步到餅餅踏踏。
            </Text>
            <TextInput
              className="mt-2"
              label="同步網址"
              value={syncValue}
              onChangeText={setSyncValue}
            />
          </Card.Content>
          <Card.Actions>
            <Button
              onPress={(e) => handleSyncButtonClick(7)}
              loading={loading}
              disabled={loading}
            >
              同步七日資料
            </Button>
            <Button
              mode="contained"
              onPress={(e) => handleSyncButtonClick(1)}
              loading={loading}
              disabled={loading}
            >
              同步 24 小時資料
            </Button>
          </Card.Actions>
        </Card>
        {log != "" && (
          <Card>
            <Card.Content>
              <Text variant="titleLarge">同步日誌</Text>
              <ScrollView className="h-40">
                <Text>{log}</Text>
              </ScrollView>
            </Card.Content>
          </Card>
        )}
        <Text>
          {lastAutoSync === ""
            ? "從未自動同步"
            : `上次自動同步：${lastAutoSync}`}
        </Text>
      </View>
    </>
  );
}
