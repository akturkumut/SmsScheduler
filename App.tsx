import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  NativeModules,
  StyleSheet,
  Alert,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  NativeEventEmitter,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { SmsModule } = NativeModules;

interface SmsSchedulerModule {
  scheduleSms(id: string, phoneNumber: string, message: string, time: number): void;
  cancelSms(id: string): void;
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): void;
}

const TypedSmsModule: SmsSchedulerModule = SmsModule;

interface ScheduledSms {
  id: string;
  phoneNumber: string;
  message: string;
  date: Date;
  status: 'pending' | 'sent' | 'failed';
}

const SMS_STORAGE_KEY = '@scheduled_sms';

const App = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [date, setDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [scheduledSmsList, setScheduledSmsList] = useState<ScheduledSms[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadScheduledSms();

    const eventEmitter = new NativeEventEmitter(SmsModule);
    const subscription = eventEmitter.addListener('onSmsStatus', (data: { id: string, status: 'sent' | 'failed' }) => {
      handleSmsStatus(data.id, data.status);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleSmsStatus = (smsId: string, status: 'sent' | 'failed') => {
    setScheduledSmsList(prevList => {
      const updatedList = prevList.map(sms =>
        sms.id === smsId ? { ...sms, status: status } : sms
      );
      saveScheduledSms(updatedList);
      return updatedList;
    });
  };

  const loadScheduledSms = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(SMS_STORAGE_KEY);
      if (jsonValue != null) {
        const loadedList: ScheduledSms[] = JSON.parse(jsonValue).map((item: any) => ({
          ...item,
          date: new Date(item.date),
        }));
        setScheduledSmsList(loadedList);
      }
    } catch (e) {
      console.error('Failed to load scheduled SMS list.', e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveScheduledSms = async (list: ScheduledSms[]) => {
    try {
      const jsonValue = JSON.stringify(list);
      await AsyncStorage.setItem(SMS_STORAGE_KEY, jsonValue);
    } catch (e) {
      console.error('Failed to save scheduled SMS list.', e);
    }
  };

  const showDatePicker = () => setDatePickerVisibility(true);
  const hideDatePicker = () => setDatePickerVisibility(false);

  const handleConfirm = (selectedDate: Date) => {
    if (selectedDate.getTime() <= new Date().getTime()) {
      Alert.alert('Hata', 'Geçmişe ait bir zaman seçemezsiniz.');
      hideDatePicker();
      return;
    }
    setDate(selectedDate);
    hideDatePicker();
  };

  const scheduleSms = async () => {
    if (!phoneNumber || !message) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun.');
      return;
    }

    if (date.getTime() <= new Date().getTime()) {
      Alert.alert('Hata', 'Geçmişe ait bir zaman seçemezsiniz.');
      return;
    }

    const hasSmsPermission = await checkAndRequestPermissions();
    if (!hasSmsPermission) {
      return;
    }

    const smsId = `sms-${Date.now()}`;

    if (TypedSmsModule.scheduleSms) {
      TypedSmsModule.scheduleSms(smsId, phoneNumber, message, date.getTime());

      const newSms: ScheduledSms = {
        id: smsId,
        phoneNumber: phoneNumber,
        message: message,
        date: date,
        status: 'pending',
      };
      const updatedList = [...scheduledSmsList, newSms];
      setScheduledSmsList(updatedList);
      saveScheduledSms(updatedList);

      setPhoneNumber('');
      setMessage('');

      Alert.alert(
        'Başarılı',
        'Mesajınız başarıyla zamanlandı ve listeye eklendi.'
      );
    } else {
      Alert.alert('Hata', 'SmsModule.scheduleSms metodu bulunamadı.');
    }
  };

  const checkAndRequestPermissions = async (): Promise<boolean> => {
    try {
      const smsPermissionStatus = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.SEND_SMS
      );
      if (smsPermissionStatus !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Hata', 'SMS gönderme izni verilmedi. Lütfen uygulama ayarlarından izinleri kontrol edin.');
        return false;
      }

      if (parseInt(Platform.Version.toString()) >= 33) {
        const canSchedule = await TypedSmsModule.canScheduleExactAlarms();
        if (!canSchedule) {
          Alert.alert(
            'İzin Gerekli',
            'Bu uygulama, tam saatte SMS gönderebilmek için "Kesin Alarm ve Hatırlatıcılar" iznine ihtiyaç duyar. Lütfen sonraki ekranda bu izni verin.',
            [
              {
                text: 'İptal',
                style: 'cancel',
              },
              {
                text: 'Ayarlara Git',
                onPress: () => TypedSmsModule.openExactAlarmSettings(),
              },
            ]
          );
          return false;
        }
      }

      return true;
    } catch (err) {
      console.warn(err);
      return false;
    }
  };

  const cancelSms = (smsId: string) => {
    Alert.alert(
      'İptal Onayı',
      'Bu zamanlanmış SMS\'i iptal etmek istediğinize emin misiniz?',
      [
        {
          text: 'Hayır',
          style: 'cancel',
        },
        {
          text: 'Evet',
          onPress: () => {
            if (TypedSmsModule.cancelSms) {
              TypedSmsModule.cancelSms(smsId);
              const updatedList = scheduledSmsList.filter(sms => sms.id !== smsId);
              setScheduledSmsList(updatedList);
              saveScheduledSms(updatedList);
              Alert.alert('İptal Edildi', 'Zamanlanmış SMS iptal edildi.');
            } else {
              Alert.alert('Hata', 'SmsModule.cancelSms metodu bulunamadı.');
            }
          },
        },
      ]
    );
  };

  const formattedDate = date.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const renderSmsItem = ({ item }: { item: ScheduledSms }) => {
    let statusText = '';
    let statusColor = '';
    let showCancelButton = false;

    if (item.status === 'pending') {
      statusText = 'Beklemede';
      statusColor = 'orange';
      showCancelButton = true;
    } else if (item.status === 'sent') {
      statusText = 'Gönderildi';
      statusColor = 'green';
      showCancelButton = false;
    } else if (item.status === 'failed') {
      statusText = 'Başarısız';
      statusColor = 'red';
      showCancelButton = false;
    }

    return (
      <View style={styles.listItem}>
        <View style={styles.listItemTextContainer}>
          <Text style={styles.listItemText}>
            <Text style={{ fontWeight: 'bold' }}>Numara:</Text> {item.phoneNumber}
          </Text>
          <Text style={styles.listItemText}>
            <Text style={{ fontWeight: 'bold' }}>Mesaj:</Text> {item.message.length > 30 ? `${item.message.substring(0, 30)}...` : item.message}
          </Text>
          <Text style={styles.listItemText}>
            <Text style={{ fontWeight: 'bold' }}>Tarih:</Text> {item.date.toLocaleString()}
          </Text>
          <Text style={[styles.listItemText, { color: statusColor, fontWeight: 'bold' }]}>
            Durum: {statusText}
          </Text>
        </View>
        {showCancelButton && (
          <TouchableOpacity
            onPress={() => cancelSms(item.id)}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelButtonText}>İptal Et</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>SMS'ler yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Otomatik SMS Zamanlayıcı</Text>

      <TextInput
        style={styles.input}
        placeholder="Telefon Numarası (örn: +90...)"
        onChangeText={setPhoneNumber}
        value={phoneNumber}
        keyboardType="phone-pad"
      />

      <TextInput
        style={[styles.input, styles.messageInput]}
        placeholder="Mesajınız..."
        onChangeText={setMessage}
        value={message}
        multiline
      />

      <Button title="Tarih ve Saat Ayarla" onPress={showDatePicker} />
      <Text style={styles.dateText}>Seçilen Tarih: {formattedDate}</Text>

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="datetime"
        onConfirm={handleConfirm}
        onCancel={hideDatePicker}
        is24Hour={true}
      />

      <Button title="SMS'i Zamanla" onPress={scheduleSms} color="#841584" />

      {scheduledSmsList.length > 0 && (
        <View style={styles.listContainer}>
          <Text style={styles.listTitle}>Zamanlanmış SMS'ler</Text>
          <FlatList
            data={scheduledSmsList}
            renderItem={renderSmsItem}
            keyExtractor={item => item.id}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  input: {
    width: '100%',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  messageInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  dateText: {
    marginVertical: 15,
    fontSize: 16,
    color: '#555',
  },
  listContainer: {
    marginTop: 20,
    width: '100%',
    flex: 1,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listItemTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  listItemText: {
    fontSize: 14,
    marginBottom: 2,
    color: '#333',
  },
  cancelButton: {
    backgroundColor: '#ff4d4d',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default App;
