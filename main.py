import webview
import time
import threading
import random
import os
from pynput import keyboard, mouse

from ml_engine import MLEngine
from security_vault import SecurityVault

MASTER_DWELL = 399.63 

class BiometricEngine:
    def __init__(self, window):
        self.window = window
        self.press_time = 0
        self.last_mouse_time = time.time()
        self.last_mouse_pos = (0, 0)
        self.current_velocity = 0
        self.log_file = "security_audit.enc"
        self.vault = SecurityVault()
        self.ml = MLEngine()

        # create the file if it doesn't exist
        if not os.path.exists(self.log_file):
            with open(self.log_file, "w") as f:
                pass

    def save_to_disk(self, dwell, velocity, score):
        """Appends encrypted biometric data to a local file"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"{timestamp} | {dwell}ms | {velocity}px/s | {score}%"
        token = self.vault.encrypt_data(log_entry)
        with open(self.log_file, "a", encoding="utf-8") as f:
            f.write(token + "\n")

    # --- mouse logic ---
    def on_move(self, x, y):
        current_time = time.time()
        dt = current_time - self.last_mouse_time
        
        if dt > 0.1:  # update velocity every 100ms to save CPU
            # calculate distance using pythagorean theorem
            dx = x - self.last_mouse_pos[0]
            dy = y - self.last_mouse_pos[1]
            distance = (dx**2 + dy**2)**0.5
            
            # velocity = distance / time
            self.current_velocity = int(distance / dt)
            
            self.last_mouse_pos = (x, y)
            self.last_mouse_time = current_time

    # --- keyboard logic ---
    def on_press(self, key):
        self.press_time = time.time()

    def on_release(self, key):
        duration = (time.time() - self.press_time) * 1000
        anomaly_score = self.ml.predict_anomaly(duration, self.current_velocity)

        # send both to ui
        try:
            self.window.evaluate_js(f"window.updateMetrics({duration:.2f}, {self.current_velocity}, {anomaly_score:.2f})")
        except:
            pass

        # auto-save: log to the project folder
        self.save_to_disk(round(duration, 2), self.current_velocity, anomaly_score)

def start_monitoring(window):
    engine = BiometricEngine(window)
    
    # start keyboard listener
    k_listener = keyboard.Listener(on_press=engine.on_press, on_release=engine.on_release)
    # start mouse listener
    m_listener = mouse.Listener(on_move=engine.on_move)
    
    k_listener.start()
    m_listener.start()
    
    k_listener.join()
    m_listener.join()

if __name__ == "__main__":
    # Start HTTPS backend (serves UI + APIs)
    from backend import run_https

    threading.Thread(target=run_https, kwargs={"port": 8443}, daemon=True).start()
    time.sleep(0.4)  # small boot buffer

    window = webview.create_window('SHIELD-ID MONITOR', 'https://server.zaid:8443')
    threading.Thread(target=start_monitoring, args=(window,), daemon=True).start()
    webview.start()
