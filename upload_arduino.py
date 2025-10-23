import serial
import json
import asyncio
import socketio

from aiohttp import web

# Adjust these values
SERIAL_PORT = '/dev/ttyACM0'
BAUD_RATE = 115200


async def read_serial():
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
            print(f"🔌 Connected to {SERIAL_PORT} at {BAUD_RATE} baud.")
            
            async with socketio.AsyncSimpleClient() as io:
                await io.connect(
                    'https://vertiapp.xyz', 
                    socketio_path="/socket.io/"
                )
                print("🔗 Connected to Socket.IO server.")

                while True:
                    if asyncio.get_event_loop().is_closed():
                        break
                    
                    line = ser.readline().decode('utf-8').strip()
                    if not line:
                        continue

                    print("📥 Received from Pi Pico:", line)
                    try:
                        data = json.loads(line)
                        
                        sensor_map = {
                            "temperature": "C",
                            "humidity": "%",
                            "light": "lux",
                            "lettuce_flow_rate": "L/min",
                            "spinach_flow_rate": "L/min",
                            "lettuce_water_level": "bool",
                            "spinach_water_level": "bool",
                            "lettuce_pump": "bool",
                            "spinach_pump": "bool"
                        }

                        payload = {}
                        for key, value in data.items():
                            if value is None or (isinstance(value, float) and str(value).lower() == 'nan'):
                                continue

                            if isinstance(value, bool):
                                value = 1.0 if value else 0.0

                            if key in ["lettuce_flow_rate", "spinach_flow_rate"]:
                                value = value / 1000

                            payload[key] = value

                        if payload:
                            await io.emit('sensor_data', payload)
                            print(f"=====\n\n📤 Sent to server: {payload} \n\n =======")
                    except json.JSONDecodeError:
                        continue

                    await asyncio.sleep(1)

    except serial.SerialException as e:
        print(f"❌ Could not open serial port {SERIAL_PORT}: {e}")


async def main():
    loop = asyncio.get_event_loop()
    loop.create_task(read_serial())
    while True:
        await asyncio.sleep(3600)


if __name__ == '__main__':
    asyncio.run(main())
