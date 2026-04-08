import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  FileText, CheckSquare, MessageSquare, Download, Users, 
  Send, Loader2, Clock, CheckCircle2, Circle, Share2, Mail, X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from '@google/genai';

interface Task {
  id: string;
  description: string;
  assignee: string;
  deadline: string;
  status: 'new' | 'in progress' | 'done';
}

interface Speaker {
  [key: string]: string;
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  transcription: { speaker: string; timestamp: string; text: string }[];
  summary: { topics: string[]; decisions: string[] };
  tasks: Task[];
  speakers: Speaker;
  chat_history?: {role: 'user' | 'ai', text: string}[];
}

export default function MeetingDetails() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcription' | 'tasks' | 'chat'>('summary');
  const [loading, setLoading] = useState(true);

  // Chat state
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [isChatting, setIsChatting] = useState(false);

  // Speaker edit state
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [speakerNameInput, setSpeakerNameInput] = useState('');

  // Share modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Task edit state
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [taskEditForm, setTaskEditForm] = useState<{description: string, assignee: string, deadline: string}>({description: '', assignee: '', deadline: ''});

  useEffect(() => {
    fetch(`/api/meetings/${id}`)
      .then(res => res.json())
      .then(data => {
        setMeeting(data);
        if (data.chat_history) {
          setChatHistory(data.chat_history);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [id]);

  const handleSpeakerSave = async (originalSpeaker: string) => {
    if (!meeting || !speakerNameInput.trim()) return;
    
    const newSpeakers = { ...meeting.speakers, [originalSpeaker]: speakerNameInput.trim() };
    
    try {
      await fetch(`/api/meetings/${id}/speakers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakers: newSpeakers })
      });
      
      setMeeting({ ...meeting, speakers: newSpeakers });
      setEditingSpeaker(null);
    } catch (err) {
      console.error('Failed to update speaker', err);
    }
  };

  const handleTaskSave = async (taskId: string) => {
    if (!meeting) return;
    
    const newTasks = meeting.tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, ...taskEditForm };
      }
      return t;
    });

    try {
      await fetch(`/api/meetings/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: newTasks })
      });
      
      setMeeting({ ...meeting, tasks: newTasks });
      setEditingTask(null);
    } catch (err) {
      console.error('Failed to update tasks', err);
    }
  };

  const handleTaskStatusToggle = async (taskId: string) => {
    if (!meeting) return;
    
    const newTasks = meeting.tasks.map(t => {
      if (t.id === taskId) {
        const nextStatus = t.status === 'new' ? 'in progress' : t.status === 'in progress' ? 'done' : 'new';
        return { ...t, status: nextStatus as Task['status'] };
      }
      return t;
    });

    try {
      await fetch(`/api/meetings/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: newTasks })
      });
      
      setMeeting({ ...meeting, tasks: newTasks });
    } catch (err) {
      console.error('Failed to update tasks', err);
    }
  };

  const handleChatSubmit = async (e?: React.FormEvent, template?: string) => {
    e?.preventDefault();
    const query = template || chatQuery;
    if (!query.trim() || !meeting) return;

    const newHistory = [...chatHistory, { role: 'user' as const, text: query }];
    setChatHistory(newHistory);
    setChatQuery('');
    setIsChatting(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const transcriptText = meeting.transcription.map((t: any) => `[${t.timestamp}] ${t.speaker}: ${t.text}`).join('\n');
      
      let prompt = query;
      if (template === 'summary') {
        prompt = 'Сделай краткое саммари этой встречи.';
      } else if (template === 'risks') {
        prompt = 'Какие риски обсуждались на этой встрече?';
      } else if (template === 'decisions') {
        prompt = 'Какие ключевые решения были приняты?';
      }

      const fullPrompt = `
        Транскрипция встречи:
        ${transcriptText}

        Вопрос пользователя: ${prompt}
        
        Ответь на вопрос пользователя, основываясь ТОЛЬКО на предоставленной транскрипции. Отвечай на русском языке.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }]
      });

      const answer = response.text;
      if (!answer) throw new Error('No response from Gemini');

      const updatedHistory = [...newHistory, { role: 'ai' as const, text: answer }];
      setChatHistory(updatedHistory);

      // Save history to backend
      await fetch(`/api/meetings/${id}/chat_history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: updatedHistory })
      });

    } catch (err) {
      console.error('Chat error', err);
      setChatHistory([...newHistory, { role: 'ai', text: 'Произошла ошибка при получении ответа.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  const getSummaryText = () => {
    if (!meeting) return '';
    let text = `Саммари встречи: ${meeting.title}\n\n`;
    text += `Темы:\n`;
    meeting.summary.topics.forEach(t => text += `- ${t}\n`);
    text += `\nРешения:\n`;
    meeting.summary.decisions.forEach(d => text += `- ${d}\n`);
    text += `\nЗадачи:\n`;
    meeting.tasks.forEach(t => text += `- ${t.description} (${t.assignee}, ${t.deadline})\n`);
    return text;
  };

  const shareViaEmail = () => {
    if (!meeting) return;
    const subject = encodeURIComponent(`Саммари встречи: ${meeting.title}`);
    const body = encodeURIComponent(getSummaryText());
    window.open(`mailto:?subject=${subject}&body=${body}`);
    setIsShareModalOpen(false);
  };

  const shareViaTelegram = () => {
    if (!meeting) return;
    const text = encodeURIComponent(getSummaryText());
    window.open(`https://t.me/share/url?url=${window.location.href}&text=${text}`, '_blank');
    setIsShareModalOpen(false);
  };

  const exportToMarkdown = () => {
    if (!meeting) return;

    let md = `# ${meeting.title}\n\n`;
    md += `**Дата:** ${format(new Date(meeting.date), 'dd.MM.yyyy HH:mm')}\n\n`;
    
    md += `## Саммари\n\n`;
    md += `### Темы обсуждения\n`;
    meeting.summary.topics.forEach(t => md += `- ${t}\n`);
    md += `\n### Принятые решения\n`;
    meeting.summary.decisions.forEach(d => md += `- ${d}\n`);
    
    md += `\n## Задачи\n\n`;
    meeting.tasks.forEach(t => {
      const statusMark = t.status === 'done' ? '[x]' : '[ ]';
      md += `- ${statusMark} **${t.description}** (Ответственный: ${t.assignee}, Срок: ${t.deadline})\n`;
    });

    md += `\n## Транскрипция\n\n`;
    meeting.transcription.forEach(t => {
      const speakerName = meeting.speakers[t.speaker] || t.speaker;
      md += `**[${t.timestamp}] ${speakerName}:** ${t.text}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Meeting_${format(new Date(meeting.date), 'yyyy-MM-dd')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!meeting) {
    return <div>Встреча не найдена</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{meeting.title}</h1>
          <p className="text-gray-500 flex items-center">
            <Clock className="w-4 h-4 mr-1.5" />
            {format(new Date(meeting.date), 'dd MMMM yyyy, HH:mm')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsShareModalOpen(true)}
            className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Поделиться
          </button>
          <button 
            onClick={exportToMarkdown}
            className="flex items-center px-4 py-2 bg-indigo-600 border border-transparent text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4 mr-2" />
            Экспорт в MD
          </button>
        </div>
      </div>

      {isShareModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold">Поделиться саммари</h3>
              <button onClick={() => setIsShareModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <button 
                onClick={shareViaTelegram}
                className="w-full flex items-center px-4 py-3 bg-[#0088cc] text-white rounded-xl hover:bg-[#0077b3] transition-colors font-medium"
              >
                <Send className="w-5 h-5 mr-3" />
                Отправить в Telegram
              </button>
              <button 
                onClick={shareViaEmail}
                className="w-full flex items-center px-4 py-3 bg-gray-100 text-gray-800 rounded-xl hover:bg-gray-200 transition-colors font-medium"
              >
                <Mail className="w-5 h-5 mr-3" />
                Отправить по Email
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex border-b border-gray-200 overflow-x-auto hide-scrollbar">
        {[
          { id: 'summary', icon: FileText, label: 'Саммари' },
          { id: 'tasks', icon: CheckSquare, label: 'Задачи' },
          { id: 'transcription', icon: Users, label: 'Транскрипция' },
          { id: 'chat', icon: MessageSquare, label: 'AI Ассистент' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center px-6 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
              activeTab === tab.id 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm min-h-[500px]">
        {activeTab === 'summary' && (
          <div className="p-6 md:p-8 space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
                  <FileText className="w-4 h-4" />
                </div>
                Темы обсуждения
              </h3>
              <ul className="space-y-3">
                {meeting.summary.topics.map((topic, i) => (
                  <li key={i} className="flex items-start">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 mr-3 flex-shrink-0" />
                    <span className="text-gray-700 leading-relaxed">{topic}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="h-px bg-gray-100" />

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center mr-3">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                Принятые решения
              </h3>
              <ul className="space-y-3">
                {meeting.summary.decisions.map((decision, i) => (
                  <li key={i} className="flex items-start">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 mr-3 flex-shrink-0" />
                    <span className="text-gray-700 leading-relaxed">{decision}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="p-6 md:p-8">
            <div className="space-y-4">
              {meeting.tasks.map(task => (
                <div key={task.id} className={`flex items-start p-4 rounded-xl border transition-colors ${task.status === 'done' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-indigo-200'}`}>
                  <button 
                    onClick={() => handleTaskStatusToggle(task.id)}
                    className="mt-0.5 mr-4 flex-shrink-0 text-gray-400 hover:text-indigo-600 transition-colors"
                  >
                    {task.status === 'done' ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : task.status === 'in progress' ? (
                      <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                    ) : (
                      <Circle className="w-6 h-6" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    {editingTask === task.id ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={taskEditForm.description}
                          onChange={e => setTaskEditForm({...taskEditForm, description: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Описание задачи"
                        />
                        <div className="flex gap-3">
                          <input
                            type="text"
                            value={taskEditForm.assignee}
                            onChange={e => setTaskEditForm({...taskEditForm, assignee: e.target.value})}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            placeholder="Ответственный"
                          />
                          <input
                            type="text"
                            value={taskEditForm.deadline}
                            onChange={e => setTaskEditForm({...taskEditForm, deadline: e.target.value})}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            placeholder="Срок"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleTaskSave(task.id)} className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">Сохранить</button>
                          <button onClick={() => setEditingTask(null)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">Отмена</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className={`text-base font-medium mb-2 ${task.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                          {task.description}
                        </p>
                        <div className="flex flex-wrap gap-3 text-sm items-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium">
                            Ответственный: {task.assignee}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-orange-50 text-orange-700 font-medium">
                            Срок: {task.deadline}
                          </span>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md font-medium ${
                            task.status === 'done' ? 'bg-green-50 text-green-700' :
                            task.status === 'in progress' ? 'bg-blue-50 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            Статус: {task.status === 'new' ? 'Новая' : task.status === 'in progress' ? 'В работе' : 'Готово'}
                          </span>
                          <button 
                            onClick={() => {
                              setEditingTask(task.id);
                              setTaskEditForm({description: task.description, assignee: task.assignee, deadline: task.deadline});
                            }}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium ml-auto"
                          >
                            Изменить
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {meeting.tasks.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  Задачи не найдены
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'transcription' && (
          <div className="flex flex-col h-[600px]">
            <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl flex flex-col gap-4">
              <div className="flex items-center">
                <input
                  type="text"
                  placeholder="Поиск по транскрипции..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-gray-500 mr-2">Спикеры:</span>
                {Object.entries(meeting.speakers).map(([original, current]) => (
                  <div key={original} className="inline-flex items-center bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                    {editingSpeaker === original ? (
                      <div className="flex items-center">
                        <input
                          type="text"
                          autoFocus
                          value={speakerNameInput}
                          onChange={e => setSpeakerNameInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSpeakerSave(original)}
                          className="border-none p-0 h-5 w-24 focus:ring-0 text-sm"
                        />
                        <button onClick={() => handleSpeakerSave(original)} className="ml-2 text-indigo-600 font-medium">OK</button>
                      </div>
                    ) : (
                      <div className="flex items-center cursor-pointer group" onClick={() => { setEditingSpeaker(original); setSpeakerNameInput(current); }}>
                        <span className="font-medium text-gray-700">{current}</span>
                        <span className="ml-2 text-xs text-gray-400 group-hover:text-indigo-500">Изменить</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {meeting.transcription
                .filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()) || (meeting.speakers[t.speaker] || t.speaker).toLowerCase().includes(searchQuery.toLowerCase()))
                .map((t, i, arr) => {
                const isConsecutive = i > 0 && arr[i-1].speaker === t.speaker && !searchQuery;
                return (
                  <div key={i} className={`flex gap-4 ${isConsecutive ? 'mt-2' : 'mt-6'}`}>
                    <div className="w-16 flex-shrink-0 text-right">
                      {!isConsecutive && (
                        <span className="text-xs font-mono text-gray-400">{t.timestamp}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {!isConsecutive && (
                        <div className="font-medium text-indigo-600 text-sm mb-1">
                          {meeting.speakers[t.speaker] || t.speaker}
                        </div>
                      )}
                      <p className="text-gray-800 leading-relaxed">{t.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex flex-col h-[600px]">
            <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl flex gap-2 overflow-x-auto hide-scrollbar">
              <button onClick={() => handleChatSubmit(undefined, 'summary')} className="whitespace-nowrap px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                Сделать саммари
              </button>
              <button onClick={() => handleChatSubmit(undefined, 'risks')} className="whitespace-nowrap px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                Какие были риски?
              </button>
              <button onClick={() => handleChatSubmit(undefined, 'decisions')} className="whitespace-nowrap px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                Ключевые решения
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <MessageSquare className="w-12 h-12 mb-4 text-gray-300" />
                  <p>Задайте вопрос по содержанию встречи</p>
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-br-sm' 
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}>
                      {msg.role === 'ai' ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>
                  </div>
                ))
              )}
              {isChatting && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-5 py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-white rounded-b-2xl">
              <form onSubmit={handleChatSubmit} className="relative">
                <input
                  type="text"
                  value={chatQuery}
                  onChange={e => setChatQuery(e.target.value)}
                  placeholder="Спросите что-нибудь о встрече..."
                  className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  disabled={isChatting}
                />
                <button
                  type="submit"
                  disabled={isChatting || !chatQuery.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
