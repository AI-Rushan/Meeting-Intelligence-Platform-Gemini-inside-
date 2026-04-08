import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Upload, FileAudio, Loader2, Calendar, ChevronRight } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

interface Meeting {
  id: string;
  title: string;
  date: string;
}

export default function Dashboard() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/meetings')
      .then(res => res.json())
      .then(data => setMeetings(data))
      .catch(err => console.error('Failed to fetch meetings', err));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          
          const prompt = `
            Please analyze this meeting recording and provide the following in JSON format:
            {
              "title": "A short, descriptive title for the meeting",
              "transcription": [
                { "speaker": "SPEAKER_1", "timestamp": "00:00", "text": "..." }
              ],
              "summary": {
                "topics": ["Topic 1", "Topic 2"],
                "decisions": ["Decision 1", "Decision 2"]
              },
              "tasks": [
                { "id": "uuid", "description": "Task description", "assignee": "Name or 'ответственный не назначен'", "deadline": "Date or 'срок не установлен'", "status": "new" }
              ]
            }
            
            Rules:
            - Transcribe the entire meeting.
            - Identify speakers as SPEAKER_1, SPEAKER_2, etc.
            - Extract all tasks, decisions, and topics discussed.
            - If there is no assignee for a task, use "ответственный не назначен".
            - If there is no deadline for a task, use "срок не установлен".
            - Respond ONLY with valid JSON.
          `;

          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
              { role: 'user', parts: [{ inlineData: { data: base64, mimeType: file.type } }, { text: prompt }] }
            ],
            config: {
              responseMimeType: 'application/json',
            }
          });

          const resultText = response.text;
          if (!resultText) throw new Error('No response from Gemini');

          const data = JSON.parse(resultText);

          // Send to backend to save
          const saveRes = await fetch('/api/meetings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          
          if (!saveRes.ok) throw new Error('Failed to save meeting');
          
          const saveData = await saveRes.json();
          navigate(`/meeting/${saveData.id}`);
        } catch (error) {
          console.error(error);
          alert('Ошибка при обработке файла. Пожалуйста, попробуйте еще раз.');
          setIsUploading(false);
        }
      };
      
      reader.onerror = () => {
        alert('Ошибка при чтении файла.');
        setIsUploading(false);
      };
    } catch (error) {
      console.error(error);
      alert('Ошибка при загрузке файла. Пожалуйста, попробуйте еще раз.');
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
            <FileAudio className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Загрузить запись встречи</h2>
          <p className="text-gray-500 mb-6">
            Загрузите аудио или видео файл. Мы автоматически расшифруем его, выделим задачи и подготовим саммари.
          </p>
          
          <label className="relative inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Обработка... (это может занять несколько минут)
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Выбрать файл
              </>
            )}
            <input 
              type="file" 
              className="hidden" 
              accept="audio/*,video/*" 
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center">
          <Calendar className="w-5 h-5 mr-2 text-gray-400" />
          Недавние встречи
        </h3>
        
        {meetings.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500">
            У вас пока нет сохраненных встреч.
          </div>
        ) : (
          <div className="grid gap-4">
            {meetings.map(meeting => (
              <Link 
                key={meeting.id} 
                to={`/meeting/${meeting.id}`}
                className="bg-white p-5 rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all flex items-center justify-between group"
              >
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">{meeting.title}</h4>
                  <p className="text-sm text-gray-500">
                    {format(new Date(meeting.date), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
