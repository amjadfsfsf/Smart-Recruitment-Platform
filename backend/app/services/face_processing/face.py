import cv2
import requests
import numpy as np
from fer.fer import FER
from collections import Counter

class VideoBehaviorAssessment:
    def __init__(self, api_key="YOUR_AZURE_FACE_KEY", endpoint="https://face-api-test123.cognitiveservices.azure.com", frame_skip=15):
        self.api_key = api_key
        self.endpoint = endpoint
        self.frame_skip = frame_skip
        self.face_presence_scores = []
        self.smile_scores = []
        
        self.url = self.endpoint + "/face/v1.0/detect"
        self.headers = {
            "Ocp-Apim-Subscription-Key": self.api_key,
            "Content-Type": "application/octet-stream"
        }
        self.params = {
            "returnFaceAttributes": "headPose",
            "detectionModel": "detection_03"
        }

        self.emotion_detector = FER(mtcnn=True)

        self.prev_yaw = None
        self.prev_pitch = None
        self.prev_roll = None

        self.eye_scores = []
        self.head_scores = []
        self.expression_scores = []

    def encode_frame(self, frame):
        _, img_encoded = cv2.imencode(".jpg", frame)
        return img_encoded.tobytes()

    def detect_face_attributes(self, frame):
        response = requests.post(
            self.url,
            headers=self.headers,
            params=self.params,
            data=self.encode_frame(frame)
        )
        return response.json()

    def calculate_eye_contact_score(self, yaw, pitch):
        yaw_penalty = abs(yaw) * 1.5
        pitch_penalty = abs(pitch) * 1.0
        return max(0, 100 - yaw_penalty - pitch_penalty)

    def calculate_head_movement_score(self, yaw, pitch, roll):
        if self.prev_yaw is None or self.prev_pitch is None or self.prev_roll is None:
            self.prev_yaw = yaw
            self.prev_pitch = pitch
            self.prev_roll = roll
            return None

        yaw_change = abs(yaw - self.prev_yaw)
        pitch_change = abs(pitch - self.prev_pitch)
        roll_change = abs(roll - self.prev_roll)

        movement = (yaw_change * 0.5) + (pitch_change * 0.3) + (roll_change * 0.2)
        head_score = max(0, 100 - movement * 4)

        self.prev_yaw = yaw
        self.prev_pitch = pitch
        self.prev_roll = roll

        return head_score

    def process_head_pose(self, data):
         if isinstance(data, list) and len(data) > 0:
            face = data[0]["faceAttributes"]
            head_pose = face["headPose"]

            yaw = head_pose["yaw"]
            pitch = head_pose["pitch"]
            roll = head_pose["roll"]

            # ✅ face presence
            self.face_presence_scores.append(100)

            eye_score = self.calculate_eye_contact_score(yaw, pitch)
            self.eye_scores.append(eye_score)

            head_score = self.calculate_head_movement_score(yaw, pitch, roll)
            if head_score is not None:
                self.head_scores.append(head_score)

         else:
            # ❌ no face detected
            self.face_presence_scores.append(0)


    def detect_expression_score(self, frame):
        try:
            result = self.emotion_detector.detect_emotions(frame)

            if result:
                emotions = result[0]["emotions"]

                happy_value = emotions.get("happy", 0)
                neutral_value = emotions.get("neutral", 0)

                smile_label = self.get_smile_label(happy_value)
                engagement_label = self.get_engagement_label(happy_value, neutral_value)

                self.smile_scores.append(smile_label)
                self.expression_scores.append(engagement_label)

            else:
                self.smile_scores.append("Not clear")
                self.expression_scores.append("Not clear")

        except Exception as e:
            print("Expression error:", e)
            self.smile_scores.append("Not clear")
            self.expression_scores.append("Not clear")

                
    def get_smile_label(self, happy_value):
        if happy_value >= 0.7:
            return "Clear smile"
        elif happy_value >= 0.3:
            return "Slight smile"
        elif happy_value > 0:
            return "Very subtle smile"
        else:
            return "No smile"

    def get_engagement_label(self, happy_value, neutral_value):
        total = happy_value + neutral_value

        if happy_value >= 0.6:
            return "Highly engaged"
        elif total >= 0.6:
            return "Engaged"
        elif total >= 0.3:
            return "Moderately engaged"
        else:
            return "Low engagement"            


    def safe_mean(self, values):
                 return int(np.mean(values)) if values else 0
    def calculate_final_scores(self):
           return {
            "eye_contact": self.safe_mean(self.eye_scores),
            "head_movement": self.safe_mean(self.head_scores),
            "facial_expression": self.most_common_label(self.expression_scores),
            "face_presence": self.safe_mean(self.face_presence_scores),
            "smile_score": self.most_common_label(self.smile_scores)
        }

    def run(self,video_path):
        cap = cv2.VideoCapture(video_path)
        frame_count = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_count % self.frame_skip == 0:
                data = self.detect_face_attributes(frame)
                print(data)

                self.process_head_pose(data)

                if isinstance(data, list) and len(data) > 0:
                    self.detect_expression_score(frame)
                else:
                    self.smile_scores.append("Not detected")
                    self.expression_scores.append("Not detected")

            frame_count += 1

        cap.release()
        return self.calculate_final_scores()
    


    def most_common_label(self, values):
        return Counter(values).most_common(1)[0][0] if values else "Not detected"

     

