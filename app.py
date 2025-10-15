import os
import time
import json
import random
from flask import Flask, request, jsonify, render_template
import google.generativeai as genai
from datetime import date

# --- 1. AI 모델 설정 (코드 최상단에서 한 번만 실행) ---
# ※ 중요: 아래 "YOUR_API_KEY" 부분에 1단계에서 발급받은 실제 API 키를 붙여넣으세요.
try:
    genai.configure(api_key="AIzaSyCc7_sm9qFvm1XOBRwPS-WsvSSPCItp9MQ") # 예: genai.configure(api_key="AIzaSy...p9MQ")
except Exception as e:
    print(f"API 키 설정 중 오류가 발생했습니다. 키를 확인해주세요: {e}")
    # 키가 없으면 서버 실행이 의미 없으므로 종료합니다.
    exit()


# JSON 출력을 위한 GenerationConfig 설정
generation_config = {
  "response_mime_type": "application/json",
}

# 사용할 모델 선언
model = genai.GenerativeModel(
    "gemini-2.5-flash",
    generation_config=generation_config
)
# ----------------------------------------------------

app = Flask(__name__, static_folder='static', template_folder='templates')

@app.route('/')
def index():
    return render_template('index.html')

# --- 2. '매직 인풋'을 위한 API 엔드포인트 ---
@app.route('/parse_task', methods=['POST'])
def parse_task():
    data = request.get_json()
    user_input = data.get('user_input', '')
    if not user_input:
        return jsonify({"error": "입력 내용이 없습니다."}), 400

    print(f"Parsing task with AI: {user_input}")

    try:
        today = date.today().isoformat()
        prompt = f"""
        당신은 똑똑한 비서입니다. 사용자의 입력을 분석해서 할 일 내용, 마감일(YYYY-MM-DD 형식), 카테고리 이름을 추출해야 합니다.
        오늘 날짜는 {today} 입니다. 이 날짜를 기준으로 '내일', '다음주 월요일' 등을 계산해주세요.
        카테고리는 '#' 뒤에 오는 단어입니다.
        
        사용자 입력: "{user_input}"

        조건:
        1. 응답은 반드시 JSON 형식이어야 하며, 다른 텍스트는 절대 포함하지 마세요. 어떠한 설명이나 ```json 같은 마크다운도 포함하지 마세요.
        2. 추출한 정보는 "text", "dueDate", "categoryName" 키에 담아주세요. 정보가 없으면 해당 키의 값은 null 입니다.

        JSON 형식 예시:
        {{"text": "알고리즘 문제 풀기", "dueDate": "2025-10-20", "categoryName": "코딩테스트"}}
        """
        response = model.generate_content(prompt)
        
        # --- ✨ 중요: AI 응답을 안전하게 처리하는 로직 추가 ---
        cleaned_text = response.text.strip().replace("```json", "").replace("```", "")
        # JSON 객체가 시작하고 끝나는 부분을 찾아서 추출
        start_index = cleaned_text.find('{')
        end_index = cleaned_text.rfind('}') + 1
        
        if start_index != -1 and end_index != 0:
            json_string = cleaned_text[start_index:end_index]
            ai_response_data = json.loads(json_string)
            return jsonify(ai_response_data)
        else:
            # 만약 JSON 객체를 찾지 못하면 에러 발생
            raise ValueError("AI did not return a valid JSON object.")
        # ----------------------------------------------------

    except Exception as e:
        print(f"Error during task parsing: {e}")
        return jsonify({"error": "AI 분석에 실패했습니다. AI가 올바른 응답을 생성하지 못했을 수 있습니다."}), 500

# (기존 generate_tasks, prioritize_tasks, get_first_step 함수들은 변경 없이 그대로 유지됩니다)
@app.route('/generate_tasks', methods=['POST'])
def generate_tasks():
    data = request.get_json()
    goal = data.get('goal', '')
    include_pomodoro = data.get('includePomodoro', False)
    print(f"Generating tasks for: {goal}, Include Pomodoros: {include_pomodoro}")
    try:
        pomodoro_instruction = '각 할 일에 대해 예상되는 25분 집중 세션 횟수를 "pomodoros"라는 키로 1에서 4 사이의 숫자로 추가해줘.' if include_pomodoro else ''
        prompt = f"""
        당신은 유능한 프로젝트 매니저입니다. 사용자의 목표를 받으면, 달성을 위한 구체적인 하위 할 일 목록을 생성해야 합니다.
        목표: "{goal}"
        조건:
        1. 할 일은 3~5개 사이로 생성해줘.
        2. 응답은 반드시 JSON 형식이어야 하며, 다른 텍스트는 절대 포함하지 마.
        3. 각 할 일의 내용은 "text"라는 키로 작성해줘.
        4. {pomodoro_instruction}
        JSON 형식 예시: {{"tasks": [{{"text": "첫 번째 할 일", "pomodoros": 2}}, {{"text": "두 번째 할 일", "pomodoros": 1}}]}}
        """
        response = model.generate_content(prompt)
        ai_response_data = json.loads(response.text)
        response_tasks = []
        for i, task_data in enumerate(ai_response_data.get("tasks", [])):
            task_obj = {"id": str(int(time.time() * 1000)) + str(i), "text": task_data.get("text"), "completed": False, "createdAt": int(time.time() * 1000)}
            if include_pomodoro and "pomodoros" in task_data:
                task_obj["pomodoros"] = task_data.get("pomodoros")
            response_tasks.append(task_obj)
        return jsonify({"tasks": response_tasks})
    except Exception as e:
        print(f"An error occurred during AI call: {e}")
        return jsonify({"tasks": [{"id": str(int(time.time() * 1000)), "text": "AI 응답 에러: 잠시 후 다시 시도해주세요.", "completed": False, "createdAt": int(time.time() * 1000)}]}), 500

@app.route('/prioritize_tasks', methods=['POST'])
def prioritize_tasks():
    data = request.get_json()
    tasks_to_sort = data.get('tasks', [])
    if not tasks_to_sort: return jsonify({"sorted_ids": []})
    print(f"Prioritizing tasks...")
    try:
        task_list_str = "\n".join([f"- (ID: {t['id']}) {t['text']}" for t in tasks_to_sort])
        prompt = f"""
        당신은 최고의 생산성 전문가입니다. 아래 할 일 목록을 받으면, 논리적 순서, 중요도, 긴급도를 고려하여 가장 효율적인 순서대로 재정렬해야 합니다.
        할 일 목록: {task_list_str}
        조건:
        1. 응답은 반드시 JSON 형식이어야 하며, 다른 텍스트는 절대 포함하지 마.
        2. 재정렬된 할 일의 ID만 순서대로 "sorted_ids" 리스트에 담아서 반환해줘.
        JSON 형식 예시: {{ "sorted_ids": ["ID3", "ID1", "ID2"] }}
        """
        response = model.generate_content(prompt)
        ai_response_data = json.loads(response.text)
        return jsonify(ai_response_data)
    except Exception as e:
        print(f"An error occurred during AI call: {e}")
        return jsonify({"sorted_ids": [t['id'] for t in tasks_to_sort]}), 500

@app.route('/get_first_step', methods=['POST'])
def get_first_step():
    data = request.get_json()
    task_text = data.get('task_text', '')
    print(f"Generating first step for: {task_text}")
    try:
        prompt = f"""
        당신은 행동 심리학 전문가입니다. 어떤 일을 시작하기 막막해하는 사용자를 위해, 지금 당장 5분 안에 할 수 있는 아주 작고 구체적인 첫 행동 하나를 제안해야 합니다.
        할 일: "{task_text}"
        조건:
        1. 응답은 반드시 JSON 형식이어야 하며, 다른 텍스트는 절대 포함하지 마.
        2. 제안하는 첫 행동은 "first_step" 이라는 키의 값으로 작성해줘.
        JSON 형식 예시: {{ "first_step": "관련 유튜브 영상 1개를 찾아보기" }}
        """
        response = model.generate_content(prompt)
        ai_response_data = json.loads(response.text)
        return jsonify(ai_response_data)
    except Exception as e:
        print(f"An error occurred during AI call: {e}")
        return jsonify({"first_step": "AI 제안을 받아오는 데 실패했습니다."}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)