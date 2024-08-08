from fastapi import FastAPI, HTTPException, File, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from google.cloud import speech, texttospeech
from google.cloud import translate_v2 as translate
from openai import OpenAI
from pydub import AudioSegment
from dotenv import load_dotenv
from datetime import datetime  # Import datetime
import os
import io
import uvicorn
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

# Google Cloud
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'google_secret_key.json'
speech_client = speech.SpeechClient()
tts_client = texttospeech.TextToSpeechClient()
translate_client = translate.Client()

# Audio Manipulation
ffmpeg_path = os.path.join(os.path.dirname(__file__), "ffmpeg", "bin", "ffmpeg.exe")
ffprobe_path = os.path.join(os.path.dirname(__file__), "ffmpeg", "bin", "ffprobe.exe")
if not os.path.exists(ffmpeg_path) or not os.path.exists(ffprobe_path):
    raise EnvironmentError("ffmpeg or ffprobe not found in project directory. Please ensure they are included.")
os.environ["PATH"] += os.pathsep + os.path.dirname(ffmpeg_path)
os.environ["PATH"] += os.pathsep + os.path.dirname(ffprobe_path)
AudioSegment.converter = ffmpeg_path
AudioSegment.ffmpeg = ffmpeg_path
AudioSegment.ffprobe = ffprobe_path

# Global context list
total_transcript = [
    {"role": "system", "content": "You are a language tutor, having a conversation in Japanese with a student. Ask questions, and be friendly."}
]

# ============= Functions ============= 
def write_to_file(content, filename):
    with open(filename, 'a', encoding='utf-8') as file:  # Specify utf-8 encoding
        file.write(content + '\n')

async def extract_keywords(text: str):
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a linguistic expert. Extract keywords such as nouns, verbs, and adverbs from the following text. Return a plaintext sentence separating each word with a comma."},
                {"role": "user", "content": text}
            ],
            temperature=0.7
        )
        keywords_text = response.choices[0].message.content

        keywords = keywords_text.split(',')
        return keywords
    
    except Exception as e:
        print(f"error in extract_keywords: {e}")
        return []

# ============= Endpoints ============= 
@app.post("/transcribe/")
async def transcribe(file: UploadFile = File(...)):
    contents = await file.read()
    received_audio_path = "received_audio.webm"
    with open(received_audio_path, "wb") as f:
        f.write(contents)

    try:
        audio = AudioSegment.from_file(received_audio_path, format="webm")
        mono_file_name = "uploaded_mono.wav"
        audio.set_channels(1).set_sample_width(2).export(mono_file_name, format="wav")  # Ensure 16-bit samples
        audio_path = mono_file_name

        with io.open(audio_path, "rb") as audio_file:
            content = audio_file.read()
            audio = speech.RecognitionAudio(content=content)

        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            enable_automatic_punctuation=True,
            audio_channel_count=1,
            language_code="ja-JP",
        )

        response = speech_client.recognize(config=config, audio=audio)
        transcripts = [result.alternatives[0].transcript for result in response.results]
        return {"transcript": " ".join(transcripts)}
    except Exception as e:
        print(f"Error during processing: {e}")
        return {"error": str(e)}

@app.post("/generate-response/")
async def generate_response(transcript: dict):
    global total_transcript

    if 'transcript' not in transcript:
        raise ValueError("Missing 'transcript' key in request body")
    
    # Append the new user message to the context
    total_transcript.append({"role": "user", "content": transcript['transcript']})
    
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=total_transcript
        )
        response_text = response.choices[0].message.content
        
        # Append the assistant's response to the context
        total_transcript.append({"role": "assistant", "content": response_text})
        
        keywords = await extract_keywords(response_text)
        
        return {"response": response_text, "keywords": keywords, "context": total_transcript}
    
    except Exception as e:
        print('Error in generate-response: ', e)
        return {"error": str(e)}

@app.post("/translate/")
async def translate_text(request: Request):
    try:
        data = await request.json()
        text = data.get("text", "")

        if isinstance(text, bytes):
            text = text.decode("utf-8")

        print('text is', text)
        result = translate_client.translate(text, target_language='en')

        response = {
            "input": result["input"],
            "translatedText": result["translatedText"],
            "detectedSourceLanguage": result["detectedSourceLanguage"]
        }

        return JSONResponse(content=response)
    except Exception as e:
        print(f'Translation error: {e}')
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/set-context/")
async def set_context(request: Request):
    global total_transcript
    try:
        data = await request.json()
        new_context = data.get("context", [])
        if isinstance(new_context, list):
            total_transcript.extend(new_context)
        else:
            total_transcript.append(new_context)
        return {"message": "Context set successfully"}
    except Exception as e:
        print(f"Error in set-context: {e}")
        return {"error": str(e)}

@app.post("/text-to-speech/")
async def text_to_speech(text: dict):
    if 'text' not in text:
        raise ValueError("Missing 'text' key in request body")

    try:
        input_text = texttospeech.SynthesisInput(text=text['text'])

        voice = texttospeech.VoiceSelectionParams(
            language_code="ja-JP",
            name="ja-JP-Standard-A",
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            speaking_rate=1.0,
        )

        response = tts_client.synthesize_speech(
            request={"input": input_text, "voice": voice, "audio_config": audio_config}
        )

        write_to_file(f"TTS at {datetime.now()}: {text['text']}", "tts.txt")

        return StreamingResponse(io.BytesIO(response.audio_content), media_type="audio/wav")
    except Exception as e:
        print(f"Error during text-to-speech synthesis: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
