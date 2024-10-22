import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ScrollView } from "react-native";
import ReactNativeForegroundService from "@supersami/rn-foreground-service";

import {
  TextInput,
  Text,
  Button,
  useTheme,
  Chip,
  Card,
  Appbar,
  List,
} from "react-native-paper";

import {
  initialize,
  requestPermission,
  aggregateRecord,
} from "react-native-health-connect";
import { Alert } from "react-native";

const config = {
  config: {
    alert: true,
    onServiceErrorCallBack: function () {
      console.warn(
        "[ReactNativeForegroundService] onServiceErrorCallBack",
        arguments
      );
    },
  },
};
ReactNativeForegroundService.register(config);

ReactNativeForegroundService.add_task(
  async () => {
    console.log(
      `Got background fetch call at date: ${new Date().toISOString()}`
    );
    // Do your background work...
    await syncData({
      days: 1,
      isAutoSync: true,
    });

    await AsyncStorage.setItem("last-auto-sync", new Date().toISOString());
  },
  {
    delay: 1000 * 60 * 60 * 3,
    onLoop: true,
    taskId: "background-sync-task",
    onError: (e) => console.log(`Error logging:`, e),
  }
);

const syncData = async ({
  days = 1,
  isAutoSync = false,
  logger = console.log,
}: {
  days?: number;
  isAutoSync?: boolean;
  logger?: (message: string) => void;
}) => {
  const syncURL = (await AsyncStorage.getItem("sync-api-url")) ?? "";
  // initialize the client
  logger("正在初始化...");
  await initialize();
  if (!isAutoSync) {
    // request permissions
    logger("正在請求權限...");
    await requestPermission([
      { accessType: "read", recordType: "Distance" },
      { accessType: "read", recordType: "Steps" },
      { accessType: "read", recordType: "ActiveCaloriesBurned" },
    ]);
  }
  // get past 7 days and aggregate the data by hour
  const tasks = days * 24;
  const now = new Date();
  // set minutes, seconds, and milliseconds to 0 for now
  now.setMinutes(0);
  now.setSeconds(0);
  now.setMilliseconds(0);
  const past = new Date(now.getTime() - (tasks - 1) * 60 * 60 * 1000);
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
  const [period, setPeriod] = useState(1);
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
  function calculatePeriod(): number {
    const lastAutoSyncDate = new Date(lastAutoSync);
    const now = new Date();
    const diff = now.getTime() - lastAutoSyncDate.getTime();
    const hours = diff / 1000 / 60 / 60;
    let days = hours / 24;
    console.log("From last auto sync days: ", days);
    if (days > 7) days = 7;
    return Math.floor(days);
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
    let syncResult = await syncData({
      days,
      logger: (message) => {
        setLog((log) => message + "\n" + log);
      },
    });
    setLoading(false);
    ReactNativeForegroundService.start({
      id: 1244,
      title: "餅餅踏踏",
      message: "正在背景定時同步你的步步資料",
      icon: "ic_launcher",
      button: false,
      button2: false,
      // buttonText: "Button",
      // button2Text: "Anther Button",
      // buttonOnPress: "cray",
      setOnlyAlertOnce: true,
      color: "#000000",
      // progress: {
      //   max: 100,
      //   curr: 50,
      // },
      ongoing: true,
    });
    Alert.alert("同步成功", syncResult);
  }

  return (
    <>
      <Appbar.Header className="z-50">
        <Appbar.Content title="餅餅踏踏記錄器" />
      </Appbar.Header>
      <View
        className="flex flex-col gap-2 h-full flex-1"
        style={{ backgroundColor: theme.colors.surface }}
      >
        <ScrollView
          className="flex flex-col gap-2 pr-2"
          nestedScrollEnabled={true}
          style={{
            overflow: "visible",
            backgroundColor: theme.colors.background,
          }}
        >
          <Card mode="contained">
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
              <View className="flex flex-row gap-2 my-2">
                {[1, 3, 5, 7].map((i) => {
                  return (
                    <Chip
                      onPress={() => setPeriod(i)}
                      key={i}
                      selected={period === i}
                      style={{
                        backgroundColor:
                          period === i
                            ? theme.colors.inversePrimary
                            : theme.colors.surface,
                      }}
                    >
                      {i} 天
                    </Chip>
                  );
                })}
              </View>
              <View className="flex gap-1">
                <Button
                  mode="contained"
                  onPress={(e) => handleSyncButtonClick(period)}
                  loading={loading}
                  disabled={loading}
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: 10,
                  }}
                >
                  同步 {period} 天資料
                </Button>

                <Button
                  mode="contained"
                  onPress={(e) => calculatePeriod()}
                  loading={loading}
                  disabled={
                    loading || lastAutoSync === "" || calculatePeriod() === 0
                  }
                  style={{
                    backgroundColor: theme.colors.secondary,
                    borderRadius: 10,
                  }}
                >
                  同步遺漏的資料（自上次同步）
                </Button>
              </View>
            </Card.Content>
          </Card>

          {log != "" && (
            <Card mode="contained">
              <Card.Content>
                <Text variant="titleLarge">同步日誌</Text>
                <ScrollView className="h-40" nestedScrollEnabled={true}>
                  <Text>{log}</Text>
                </ScrollView>
              </Card.Content>
            </Card>
          )}
          <Card mode="contained">
            <Card.Content>
              <Text variant="titleLarge">自動同步</Text>
            </Card.Content>
            <List.Section>
              <List.Item
                title="最近一次自動同步時間"
                description={
                  lastAutoSync === ""
                    ? "從未自動同步"
                    : new Date(lastAutoSync).toLocaleString()
                }
                left={(props) => <List.Icon {...props} icon="history" />}
              />
            </List.Section>
          </Card>
        </ScrollView>
      </View>
    </>
  );
}
