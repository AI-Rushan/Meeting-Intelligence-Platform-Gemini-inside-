/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import MeetingDetails from './pages/MeetingDetails';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <Link to="/" className="text-xl font-semibold tracking-tight text-indigo-600 hover:text-indigo-700 transition-colors">
            Meeting Intelligence
          </Link>
          <Link 
            to="/" 
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Новое совещание
          </Link>
        </header>
        <main className="max-w-7xl mx-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/meeting/:id" element={<MeetingDetails />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
