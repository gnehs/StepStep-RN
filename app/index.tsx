import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ScrollView } from "react-native";
import BackgroundFetch from "react-native-background-fetch";
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

    initBackgroundFetch();
    Alert.alert("同步成功", syncResult);
  }

  async function initBackgroundFetch() {
    // BackgroundFetch event handler.
    const onEvent = async (taskId: string) => {
      console.log("[BackgroundFetch] task: ", taskId);
      // Do your background work...
      let syncResult = await syncData(1);
      console.log("[BackgroundFetch] syncResult: ", syncResult);
      await AsyncStorage.setItem("last-auto-sync", new Date().toLocaleString());
      // IMPORTANT:  You must signal to the OS that your task is complete.
      BackgroundFetch.finish(taskId);
    };

    // Timeout callback is executed when your Task has exceeded its allowed running-time.
    // You must stop what you're doing immediately BackgroundFetch.finish(taskId)
    const onTimeout = async (taskId: string) => {
      console.warn("[BackgroundFetch] TIMEOUT task: ", taskId);
      BackgroundFetch.finish(taskId);
    };

    // Initialize BackgroundFetch only once when component mounts.
    let status = await BackgroundFetch.configure(
      {
        minimumFetchInterval: 15,
        startOnBoot: true,
        stopOnTerminate: false,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
      },
      onEvent,
      onTimeout
    );
    BackgroundFetch.scheduleTask({
      taskId: "com.transistorsoft.customtask",
      delay: 5000,
      periodic: true,
    });
    console.log("[BackgroundFetch] configure status: ", status);
  }
  const syncData = async (
    days: number,
    logger: (message: string) => void = console.log
  ) => {
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
    const syncResult = await fetch(syncValue, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    }).then((res) => res.text());
    logger(syncResult);
    return syncResult;
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
                <Text className="font-mono">{log}</Text>
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
