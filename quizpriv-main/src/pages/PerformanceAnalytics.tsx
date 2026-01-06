import { useState } from 'react';
import { TrendingUp, Users, Target, Zap, Calendar, ChevronDown, Search, ArrowUp, ArrowDown } from 'lucide-react';

interface UserPerformance {
  id: string;
  name: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  attemptDate: string;
  aiComparison: number;
}

const mockUsers: UserPerformance[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    score: 87,
    strengths: ['Project Overview', 'Timeline'],
    weaknesses: ['Architecture'],
    attemptDate: '2024-12-01',
    aiComparison: -5,
  },
  {
    id: '2',
    name: 'Michael Chen',
    score: 92,
    strengths: ['Architecture', 'Timeline'],
    weaknesses: ['Resources'],
    attemptDate: '2024-12-02',
    aiComparison: 2,
  },
  {
    id: '3',
    name: 'Emily Rodriguez',
    score: 78,
    strengths: ['Project Overview'],
    weaknesses: ['Architecture', 'Timeline'],
    attemptDate: '2024-11-30',
    aiComparison: -12,
  },
  {
    id: '4',
    name: 'David Kim',
    score: 95,
    strengths: ['Architecture', 'Project Overview', 'Timeline'],
    weaknesses: [],
    attemptDate: '2024-12-03',
    aiComparison: 5,
  },
];

const subtopicScores = [
  { subtopic: 'Project Overview', score: 85 },
  { subtopic: 'Architecture', score: 72 },
  { subtopic: 'Timeline', score: 88 },
  { subtopic: 'Resources', score: 79 },
];

const userVsAI = [
  { subtopic: 'Project Overview', user: 85, ai: 92 },
  { subtopic: 'Architecture', user: 72, ai: 88 },
  { subtopic: 'Timeline', user: 88, ai: 90 },
  { subtopic: 'Resources', user: 79, ai: 85 },
];

export function PerformanceAnalytics() {
  const [sortField, setSortField] = useState<string>('score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedUsers = [...mockUsers].sort((a, b) => {
    let aVal, bVal;
    switch (sortField) {
      case 'name':
        aVal = a.name;
        bVal = b.name;
        break;
      case 'score':
        aVal = a.score;
        bVal = b.score;
        break;
      case 'aiComparison':
        aVal = a.aiComparison;
        bVal = b.aiComparison;
        break;
      default:
        aVal = a.score;
        bVal = b.score;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const maxScore = Math.max(...subtopicScores.map((s) => s.score));
  const avgScore = Math.round(
    subtopicScores.reduce((sum, s) => sum + s.score, 0) / subtopicScores.length
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <p className="text-gray-600">
          Comprehensive analytics showing user performance, AI comparisons, and topic mastery
        </p>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1 max-w-xs">
          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>Last 3 months</option>
            <option>All time</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative flex-1 max-w-xs">
          <select className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white">
            <option>All Transcripts</option>
            <option>Q4 Planning Meeting</option>
            <option>Architecture Review</option>
            <option>Sprint Planning</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative flex-1 max-w-xs">
          <select className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white">
            <option>View by User</option>
            <option>View by Subtopic</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Target className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
              +5.2%
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">{avgScore}%</p>
          <p className="text-sm text-gray-600">Average Score</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
              +8.1%
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">76%</p>
          <p className="text-sm text-gray-600">Avg Topic Mastery</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">{mockUsers.length}</p>
          <p className="text-sm text-gray-600">Total Attempts</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">90%</p>
          <p className="text-sm text-gray-600">AI Benchmark</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-6">
            Weighted Score per Subtopic
          </h3>
          <div className="space-y-4">
            {subtopicScores.map((item) => (
              <div key={item.subtopic}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {item.subtopic}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {item.score}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                    style={{ width: `${item.score}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-6">
            User vs AI Performance
          </h3>
          <div className="space-y-4">
            {userVsAI.map((item) => (
              <div key={item.subtopic}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {item.subtopic}
                  </span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-xs text-gray-600">User: {item.user}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span className="text-xs text-gray-600">AI: {item.ai}%</span>
                    </div>
                  </div>
                </div>
                <div className="relative w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="absolute h-full bg-blue-500 transition-all"
                    style={{ width: `${item.user}%` }}
                  ></div>
                  <div
                    className="absolute h-full bg-green-500 opacity-50 transition-all"
                    style={{ width: `${item.ai}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <h3 className="font-semibold text-gray-900 mb-4">Topic Mastery Levels</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-3xl font-bold text-red-700 mb-1">15%</p>
            <p className="text-sm text-red-600 font-medium">Beginner</p>
            <p className="text-xs text-gray-600 mt-1">Needs improvement</p>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-3xl font-bold text-yellow-700 mb-1">45%</p>
            <p className="text-sm text-yellow-600 font-medium">Intermediate</p>
            <p className="text-xs text-gray-600 mt-1">Making progress</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-3xl font-bold text-green-700 mb-1">40%</p>
            <p className="text-sm text-green-600 font-medium">Advanced</p>
            <p className="text-xs text-gray-600 mt-1">Excellent mastery</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <h3 className="font-semibold text-gray-900 mb-2">Performance Summary</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          Most users struggled with <span className="font-semibold text-gray-900">Advanced Architecture</span>,
          scoring an average of 72%, while performing well in <span className="font-semibold text-gray-900">Timeline & Planning</span>
          with 88% average. The AI outperforms the average user by <span className="font-semibold text-gray-900">12%</span> overall
          but aligns closely on Timeline topics. We recommend additional training materials for Architecture concepts,
          and consider breaking down complex architectural questions into smaller, more digestible components.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">User Performance Table</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    User Name
                    {sortField === 'name' && (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('score')}
                  className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    Score
                    {sortField === 'score' && (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Strengths
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Weaknesses
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Attempt Date
                </th>
                <th
                  onClick={() => handleSort('aiComparison')}
                  className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    vs AI
                    {sortField === 'aiComparison' && (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-medium">
                          {user.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {user.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {user.score}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {user.strengths.map((strength) => (
                        <span
                          key={strength}
                          className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs"
                        >
                          {strength}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {user.weaknesses.length > 0 ? (
                        user.weaknesses.map((weakness) => (
                          <span
                            key={weakness}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs"
                          >
                            {weakness}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(user.attemptDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        user.aiComparison >= 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {user.aiComparison >= 0 ? '+' : ''}
                      {user.aiComparison}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
