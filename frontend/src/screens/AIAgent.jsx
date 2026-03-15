import React, { useState, useEffect, useRef, useCallback } from 'react';
import { queryAgent } from '../api';
import './AIAgent.css';

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


// --- Icons ---
const SendIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
  </svg>
);

const BotIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .3 2.7-1.1 2.7H4.3c-1.4 0-2.1-1.7-1.1-2.7L4.6 15.3" />
  </svg>
);

const UserIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

export default function AIAgent() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      text: 'Hello! I\'m your AI Agent, trained on NewEra\'s data. I can help you analyze content, team performance, subscriber trends, and upload patterns. How can I help you today?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [offlineMode, setOfflineMode] = useState(false); // true when last response came from local LLM
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const todayStr = getTodayStr();

  // Track browser online/offline status
  useEffect(() => {
    const onOnline  = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSendMessage = useCallback(async (text) => {
    if (!text.trim()) return;

    setError('');
    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await queryAgent({
        query: text.trim(),
        date: todayStr,
        context: 'editorial_operations',
      });

      // Track whether response came from local offline LLM
      if (response.offline) setOfflineMode(true);
      else setOfflineMode(false);

      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        text: response.answer || 'I\'m not sure how to answer that. Can you ask differently?',
        reasoning: response.reasoning,
        data: response.data,
        offline: response.offline,
        model: response.data?.model,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      setError(err.message || 'Failed to get response from agent');
      console.error('Agent error:', err);
    } finally {
      setLoading(false);
    }
  }, [todayStr]);


  return (
    <div className="ai-agent-page">
      <div className="agent-body">
        {/* Chat Area */}
        <div className="agent-chat-container">

          {/* Offline / local-LLM banner */}
          {(isOffline || offlineMode) && (
            <div className={`agent-mode-banner ${offlineMode ? 'agent-mode-banner--offline' : 'agent-mode-banner--warning'}`}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M3 3l18 18M10.584 10.587a2 2 0 002.828 2.83" />
              </svg>
              {offlineMode
                ? 'No internet — switched to local Llama 3.2 (1B). Responses may be slower.'
                : 'No internet detected — GPT-4.1 Mini unavailable, will switch to local Llama 3.2.'}
            </div>
          )}

          <div className="agent-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message-wrapper ${msg.type === 'user' ? 'message-wrapper--user' : 'message-wrapper--bot'}`}>
                {msg.type === 'bot' && (
                  <div className="message-avatar bot-avatar">
                    <BotIcon />
                  </div>
                )}
                
                <div className={`message-bubble message-bubble--${msg.type}`}>
                  <p className="message-text">{msg.text}</p>
                  <div className="message-meta">
                    <span className="message-time">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.type === 'bot' && msg.offline && (
                      <span className="message-mode-badge message-mode-badge--offline">
                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M3 3l18 18M10.584 10.587a2 2 0 002.828 2.83" />
                        </svg>
                        Offline · Llama 3.2
                      </span>
                    )}
                    {msg.type === 'bot' && !msg.offline && msg.model && (
                      <span className="message-mode-badge message-mode-badge--online">
                        <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="5"/>
                        </svg>
                        Online · GPT-4.1 Mini
                      </span>
                    )}
                  </div>
                </div>

                {msg.type === 'user' && (
                  <div className="message-avatar user-avatar">
                    <UserIcon />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="message-wrapper message-wrapper--bot">
                <div className="message-avatar bot-avatar">
                  <BotIcon />
                </div>
                <div className="message-bubble message-bubble--bot message-bubble--loading">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="messages-bottom-padding" />
          </div>

          {/* Input Area */}
          <div className="agent-input-section">
            {error && <div className="agent-error">{error}</div>}

            <div className={`agent-input-wrap ${input.trim() ? 'has-text' : ''}`}>
              <textarea
                ref={textareaRef}
                className="agent-input"
                placeholder="Message AI Agent..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !loading) {
                    e.preventDefault();
                    handleSendMessage(input);
                  }
                }}
                disabled={loading}
                rows={1}
              />
              <button
                className="agent-send-btn"
                onClick={() => handleSendMessage(input)}
                disabled={loading || !input.trim()}
                title="Send message"
              >
                <SendIcon />
              </button>
            </div>
            <p className="input-hint">AI can make mistakes. Consider verifying important information.</p>
          </div>
        </div>
      </div>
    </div>
  );
}