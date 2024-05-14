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
  aggregateRecord,
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
  async function sync(days: number = 1) {
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
    let syncResult = await readSampleData(days);

    Alert.alert("同步成功", syncResult);
  }
  const readSampleData = async (days: number) => {
    // initialize the client
    await initialize();

    // request permissions
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
    console.log(JSON.stringify(result, null, 2));
    return await fetch(syncValue, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    }).then((res) => res.text());
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
            <Button onPress={(e) => sync(7)}>同步七日資料</Button>
            <Button mode="contained" onPress={(e) => sync(1)}>
              同步 24 小時資料
            </Button>
          </Card.Actions>
        </Card>
      </View>
    </>
  );
}
