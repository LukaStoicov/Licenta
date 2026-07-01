import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

const manager = new BleManager();
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

export const scanForDevices = (onDeviceFound) => {
    manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
            console.log("Eroare scanare:", error);
            return;
        }
        if (device.name === 'ESP32_Fall_Monitor' || device.localName === 'ESP32_Fall_Monitor') {
            onDeviceFound(device);
        }
    });
};

export const stopScan = () => {
    manager.stopDeviceScan();
};

export const performPairing = async (deviceId, configData) => {
    try {
        console.log(`Conectare la ${deviceId}...`);
        
        const device = await manager.connectToDevice(deviceId);
        
        await device.discoverAllServicesAndCharacteristics();

        const jsonString = JSON.stringify(configData);
        const base64Data = Buffer.from(jsonString).toString('base64');

        await device.writeCharacteristicWithResponseForService(
            SERVICE_UUID,
            CHAR_UUID,
            base64Data
        );

        console.log("Date scrise cu succes!");
        return true;

    } catch (error) {
        console.error("Eroare la pairing:", error);
        throw error;
    }
};