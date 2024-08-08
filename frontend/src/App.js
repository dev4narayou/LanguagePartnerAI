import React, { useState, useRef, useEffect } from "react";
import "./App.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { v4 as uuidv4 } from "uuid";
import ChatMessage from "./ChatMessage";
import he from "he";  // Import the he library

function App() {
  const [chatHistory, setChatHistory] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [translation, setTranslation] = useState("");
  const mediaRecorderRef = useRef(null);
  const audioRef = useRef(null);
  const mainRef = useRef(null);
  const sidebarRef = useRef(null);
  const sectionsRef = useRef([]);

  const fetchTranslations = async (keywords) => {
    const translationMap = {};
    for (const keyword of keywords) {
      try {
        const response = await fetch("http://localhost:8000/translate/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ text: keyword }),
        });

        if (!response.ok) {
          throw new Error(`Translation failed: ${response.statusText}`);
        }

        const data = await response.json();
        translationMap[keyword] = `${data.translatedText}`;
      } catch (error) {
        console.error(`Error during translation of ${keyword}:`, error);
        translationMap[keyword] = keyword; // Fallback to original word
      }
    }

    return translationMap;
  };

  const processMessage = async (messageText, audioUrl = "") => {
    const newUserMessage = {
      id: uuidv4(),
      type: "user",
      text: messageText,
      audioUrl: audioUrl,
      timestamp: new Date(),
      translatedText: "",
      keywords: ["example", "keyword"], // Placeholder for actual keywords
    };
    setChatHistory((prev) => [...prev, newUserMessage]);

    try {
      const responseResponse = await fetch(
        "http://localhost:8000/generate-response/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            transcript: messageText,
          }),
        }
      );

      if (!responseResponse.ok) {
        throw new Error(
          `Response generation failed: ${responseResponse.statusText}`
        );
      }

      const responseData = await responseResponse.json();
      const botTranslatedKeywords = await fetchTranslations(
        responseData.keywords
      );

      const newBotMessage = {
        id: uuidv4(),
        type: "bot",
        text: responseData.response,
        audioUrl: "",
        timestamp: new Date(),
        translatedText: "",
        keywords: responseData.keywords || [],
        translatedKeywords: botTranslatedKeywords,
      };
      setChatHistory((prev) => [...prev, newBotMessage]);

      handleTTS(responseData.response, newBotMessage.id);
    } catch (error) {
      console.error("Error during processing:", error);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorderRef.current.ondataavailable = async (event) => {
        const audioBlob = event.data;
        const audioUrl = URL.createObjectURL(audioBlob);

        try {
          const formData = new FormData();
          formData.append("file", audioBlob, "input.webm");

          const transcribeResponse = await fetch(
            "http://localhost:8000/transcribe/",
            {
              method: "POST",
              body: formData,
              headers: {
                Accept: "application/json",
              },
            }
          );

          if (!transcribeResponse.ok) {
            throw new Error(
              `Transcription failed: ${transcribeResponse.statusText}`
            );
          }

          const transcribeData = await transcribeResponse.json();
          processMessage(transcribeData.transcript, audioUrl);
        } catch (error) {
          console.error("Error during transcription:", error);
        }
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  const handleTTS = async (text, messageId) => {
    try {
      const ttsResponse = await fetch("http://localhost:8000/text-to-speech/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ text }),
      });

      if (!ttsResponse.ok) {
        throw new Error(`TTS failed: ${ttsResponse.statusText}`);
      }

      const ttsData = await ttsResponse.blob();
      const audioBlobUrl = URL.createObjectURL(ttsData);
      setChatHistory((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, audioUrl: audioBlobUrl } : msg
        )
      );
    } catch (error) {
      console.error("Error during TTS:", error);
    }
  };

  const handleTextClick = async (id) => {
    const clickedMessage = chatHistory.find((msg) => msg.id === id);
    setSelectedText(clickedMessage.text);

    if (clickedMessage.translatedText) {
      setTranslation(clickedMessage.translatedText);
      return;
    }

    try {
      const translationResponse = await fetch(
        "http://localhost:8000/translate/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ text: clickedMessage.text }),
        }
      );

      if (!translationResponse.ok) {
        throw new Error(
          `Translation failed: ${translationResponse.statusText}`
        );
      }

      const translationData = await translationResponse.json();
      setTranslation(he.decode(translationData.translatedText));

      setChatHistory((prev) =>
        prev.map((msg) =>
          msg.id === id
            ? { ...msg, translatedText: translationData.translatedText }
            : msg
        )
      );
    } catch (error) {
      console.error("Error during translation:", error);
    }
  };

  const handleKeywordClick = (translation) => {
    setTranslation(translation);
  };

  useEffect(() => {
    if (chatHistory.length > 0 && audioRef.current) {
      const lastMessage = chatHistory[chatHistory.length - 1];
      if (lastMessage.type === "bot" && lastMessage.audioUrl) {
        audioRef.current.src = lastMessage.audioUrl;
        audioRef.current.play();
      }
    }
  }, [chatHistory]);

  const startVerticalResize = (e) => {
    e.preventDefault();
    document.onmousemove = handleVerticalResize;
    document.onmouseup = stopVerticalResize;
  };

  const handleVerticalResize = (e) => {
    const main = mainRef.current;
    const sidebar = sidebarRef.current;
    const newWidth = e.clientX;
    const minWidth = 50;
    const maxWidth = window.innerWidth - 50;
    if (newWidth > minWidth && newWidth < maxWidth) {
      main.style.width = `${newWidth}px`;
      sidebar.style.width = `${window.innerWidth - newWidth}px`;
    }
  };

  const stopVerticalResize = () => {
    document.onmousemove = null;
    document.onmouseup = null;
  };

  const startResize = (e, index) => {
    e.preventDefault();
    document.onmousemove = (event) => handleResize(event, index);
    document.onmouseup = stopResize;
  };

  const handleResize = (event, index) => {
    const sections = sectionsRef.current;
    const newHeight =
      event.clientY - sections[index].getBoundingClientRect().top;
    const nextHeight =
      sections[index + 1].getBoundingClientRect().bottom - event.clientY;

    if (newHeight > 50 && nextHeight > 50) {
      sections[index].style.height = `${newHeight}px`;
      sections[index + 1].style.height = `${nextHeight}px`;
    }
  };

  const stopResize = () => {
    document.onmousemove = null;
    document.onmouseup = null;
  };

  const handleTextInput = (e) => {
    setTextInput(e.target.value);
  };

  const handleSendText = () => {
    if (textInput.trim() !== "") {
      processMessage(textInput);
      setTextInput("");
    }
  };

  return (
    <div className="App">
      <div className="sidebar">
        <h1>Language Partner</h1>
        <h2>Chats</h2>
        <h2>Language: 日本語</h2>
        <h2>Scenarios</h2>
        <h2>Settings</h2>
        <h2>Help</h2>
      </div>
      <div className="main" ref={mainRef}>
        <div className="chat-container">
          {chatHistory.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              handleTextClick={handleTextClick}
              handleKeywordClick={handleKeywordClick}
              audioRef={audioRef}
            />
          ))}
        </div>
        <div className="input-container">
          <button onClick={startRecording} disabled={isRecording}>
            <i className="fas fa-microphone"></i>
          </button>
          <button onClick={stopRecording} disabled={!isRecording}>
            <i className="fas fa-stop"></i>
          </button>
          <input
            type="text"
            value={textInput}
            onChange={handleTextInput}
            placeholder="Type your message"
          />
          <button onClick={handleSendText}>Send</button>
        </div>
      </div>
      <div className="vertical-resizer" onMouseDown={startVerticalResize}></div>
      <div className="right-sidebar" ref={sidebarRef}>
        <div
          className="resizable-section"
          style={{ height: "33%" }}
          ref={(el) => (sectionsRef.current[0] = el)}
        >
          <div className="content" id="translation-box">
            ✨ Translation: {translation}
          </div>
          <div className="resizer" onMouseDown={(e) => startResize(e, 0)}></div>
        </div>
        <div
          className="resizable-section"
          style={{ height: "33%" }}
          ref={(el) => (sectionsRef.current[1] = el)}
        >
          <div className="content">
            ✨Analysis
            <h3>
              You used grammar well... However, it would be useful to try and
              elaborate more and be more specific...
            </h3>
            <h3>...</h3>
            <h3>...</h3>
          </div>
          <div className="resizer" onMouseDown={(e) => startResize(e, 1)}></div>
        </div>
        <div
          className="resizable-section"
          style={{ height: "34%" }}
          ref={(el) => (sectionsRef.current[2] = el)}
        >
          <div className="resources">
            <h2>✨ Recommended</h2>
            <h3>
              Based on your usage, Here are some resources that may be relevant:
            </h3>
            <ul>
              <li>
                <a href="https://cooljugator.com/ja/%E9%81%8E%E3%81%94%E3%81%99">
                  Advanced Japanese Particles
                </a>
              </li>
              <li>
                <a href="https://guidetojapanese.org/learn/cut-it-out/">
                  Cut it out with 「切れる」!
                </a>
              </li>
              <li>
                <a href="https://www.guidetojapanese.org/even.html">
                  Using 「（で）さえ」 to describe the minimum requirement
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
