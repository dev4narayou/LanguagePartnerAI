import React from "react";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";

const ChatMessage = ({ message, handleTextClick, audioRef }) => {
  const parseTextWithKeywords = (text, keywords, translatedKeywords) => {
    if (!text) return [];

    const parts = text.split(new RegExp(`(${keywords.join("|")})`, "gi"));
    // parts are lists of strings (keywords)

    // console.log('keywords are', keywords);
    // console.log('translated keywords are', translatedKeywords)

    return parts.map((part, i) =>
      keywords.includes(part) ? (
        <span
          key={i}
          className="keyword"
          data-tooltip-id={`tooltip-${part}`}
          data-tooltip-content={translatedKeywords[part]}
        >
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div
      className={`chat-message ${message.type}`}
      onClick={() => handleTextClick(message.id)}
    >
      {message.keywords.map((keyword, index) => (
        <Tooltip id={`tooltip-${keyword}`}></Tooltip>
      ))}

      <p>
        {parseTextWithKeywords(
          message.text,
          message.keywords,
          message.translatedKeywords
        )}
      </p>

      {message.audioUrl && (
        <audio ref={audioRef} controls>
          <source src={message.audioUrl} type="audio/wav" />
        </audio>
      )}
      
    </div>
  );
};

export default ChatMessage;
