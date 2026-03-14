/**
 * AI Agent Screen — Autonomous agent trained on company data.
 * Analyzes patterns, makes recommendations, answers questions.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { queryAgent } from '../api';
import './AIAgent.css';

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SUGGESTED_QUESTIONS = [
  '📊 What was our best performing section this week?',
  '⏰ Should we extend today\'s deadline based on current uploads?',
  '👥 Which designer is most productive this month?',
  '📈 What content performs best with subscribers?',
  '🎯 What should we prioritize for tomorrow\'s edition?',
  '💡 Any issues with today\'s uploads I should know about?',
  '🔄 What improvements would boost our circulation?',
  '📱 What\'s the best time to publish for maximum engagement?',
];

export default function AIAgent() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      text: 'Hey there! 👋 I\'m your AI Agent, trained on NewEra\'s company data. I can help you make informed decisions about your editorial operations. Ask me anything about your content, team performance, subscriber data, or upload patterns!',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const todayStr = getTodayStr();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = useCallback(async (text) => {
    if (!text.trim()) return;

    setError('');
    const userMessage = {
      id: messages.length + 1,
      type: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await queryAgent({
        query: text.trim(),
        date: todayStr,
        context: 'editorial_operations',
      });

      const botMessage = {
        id: messages.length + 2,
        type: 'bot',
        text: response.answer || 'I\'m not sure how to answer that. Can you ask differently?',
        reasoning: response.reasoning,
        data: response.data,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      setError(err.message || 'Failed to get response from agent');
      console.error('Agent error:', err);
    } finally {
      setLoading(false);
    }
  }, [messages.length, todayStr]);

  const handleSuggestedQuestion = (question) => {
    handleSendMessage(question);
  };

  return (
    <div className="ai-agent-page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">AI Agent</h1>
        <p className="page-subtitle">Autonomous agent trained on NewEra data. Ask questions, get data-driven insights.</p>
      </div>

      <div className="agent-body">
        {/* Chat Area */}
        <div className="agent-chat-container">
          <div className="agent-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message message--${msg.type}`}>
                <div className="message-avatar">
                  {msg.type === 'bot' ? '🤖' : '👤'}
                </div>
                <div className="message-content">
                  <p className="message-text">{msg.text}</p>
                  {msg.reasoning && (
                    <details className="message-reasoning">
                      <summary>Show reasoning</summary>
                      <p>{msg.reasoning}</p>
                    </details>
                  )}
                  {msg.data && (
                    <div className="message-data">
                      <pre>{JSON.stringify(msg.data, null, 2)}</pre>
                    </div>
                  )}
                  <span className="message-time">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            {loading && (
              <div className="message message--bot message--loading">
                <div className="message-avatar">🤖</div>
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="agent-input-section">
            {error && <div className="agent-error">{error}</div>}

            {messages.length <= 1 && !loading && (
              <div className="suggested-questions">
                <p className="suggested-label">Try asking:</p>
                <div className="suggested-grid">
                  {SUGGESTED_QUESTIONS.map((q, idx) => (
                    <button
                      key={idx}
                      className="suggested-btn"
                      onClick={() => handleSuggestedQuestion(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="agent-input-wrap">
              <textarea
                className="agent-input"
                placeholder="Ask me about your content, team, subscribers, performance... I'm trained on your data! 💡"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !loading) {
                    e.preventDefault();
                    handleSendMessage(input);
                  }
                }}
                disabled={loading}
                rows={3}
              />
              <button
                className="agent-send-btn"
                onClick={() => handleSendMessage(input)}
                disabled={loading || !input.trim()}
              >
                {loading ? '⏳ Thinking...' : '📤 Send'}
              </button>
            </div>
            <p className="input-hint">Tip: Ask specific questions for better insights. (Shift+Enter for newline)</p>
          </div>
        </div>

        {/* Agent Status Panel */}
        <div className="agent-status-panel">
          <h3 className="agent-status-title">Agent Status</h3>
          <div className="agent-status-item">
            <span className="status-label">Model</span>
            <span className="status-value">Claude 3.5 Sonnet</span>
          </div>
          <div className="agent-status-item">
            <span className="status-label">Data Sources</span>
            <span className="status-value">Pages, Editions, Subscribers, Analytics</span>
          </div>
          <div className="agent-status-item">
            <span className="status-label">Training Data</span>
            <span className="status-value">Last 90 days of operations</span>
          </div>
          <div className="agent-status-item">
            <span className="status-label">Capabilities</span>
            <ul className="status-list">
              <li>📊 Data analysis & insights</li>
              <li>🎯 Performance recommendations</li>
              <li>⏰ Timeline optimization</li>
              <li>📈 Trend forecasting</li>
              <li>👥 Team analytics</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
