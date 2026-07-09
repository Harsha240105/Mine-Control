import React, { useEffect, useState, useCallback } from 'react';
import {
  BookOpen, Search, Rocket, BookOpen as BookOpenIcon, HelpCircle, FileText,
  AlertTriangle, Lightbulb, Keyboard, Sparkles, Bookmark, Clock,
  ArrowLeft, ChevronRight, Star, ExternalLink, CheckCircle, X,
  Settings, List, Sidebar, RefreshCw, Trash2,
} from 'lucide-react';
import { Button } from '../components/ui/stateful-button';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

const SECTION_ICONS: Record<string, React.ElementType> = {
  getting_started: Rocket,
  tutorials: BookOpenIcon,
  faq: HelpCircle,
  documentation: FileText,
  troubleshooting: AlertTriangle,
  tips: Lightbulb,
  shortcuts: Keyboard,
  whats_new: Sparkles,
};

const SECTION_COLORS: Record<string, string> = {
  getting_started: 'text-green-400 bg-green-500/10 border-green-500/20',
  tutorials: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  faq: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  documentation: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  troubleshooting: 'text-red-400 bg-red-500/10 border-red-500/20',
  tips: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  shortcuts: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  whats_new: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
};

interface SectionSummary {
  id: string; title: string; icon: string; articleCount: number;
  articles: { id: string; title: string; summary: string; hasDetect: boolean }[];
}

interface ArticleView {
  section: { id: string; title: string };
  article: {
    id: string; title: string; summary: string;
    content: { type: string; title: string; text: string; keys?: string; desc?: string }[];
    related: { sectionId: string; sectionTitle: string; articleId: string; title: string; summary: string }[];
    hasDetect: boolean;
  };
}

interface SearchResult {
  sectionId: string; sectionTitle: string; articleId: string;
  articleTitle: string; summary: string; score: number; matches: string[];
}

interface BookmarkItem {
  id: number; section_id: string; article_id: string; title: string; created_at: string;
}

interface RecentView {
  section_id: string; article_id: string; title: string; viewed_at: string;
}

interface DetectionItem {
  sectionId: string; articleId: string; title: string; summary: string; detail: string;
}

export default function Guide() {
  const [sections, setSections] = useState<Record<string, SectionSummary>>({});
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [activeArticle, setActiveArticle] = useState<ArticleView | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [detections, setDetections] = useState<DetectionItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [articleLoading, setArticleLoading] = useState(false);
  const [tipsEnabled, setTipsEnabled] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [sectionsData, bookmarksData, recentData, detectionsData, prefs] = await Promise.all([
        api.getGuideSections(),
        api.getGuideBookmarks(),
        api.getGuideRecentlyViewed(),
        api.getGuideDetections(),
        api.getGuidePreferences(),
      ]);
      setSections(sectionsData.sections);
      setBookmarks(bookmarksData);
      setRecentViews(recentData);
      setDetections(detectionsData);
      setTipsEnabled(prefs.tips_enabled !== 'false');
    } catch {
      toast.error('Failed to load guide data');
    } finally {
      setLoading(false);
    }
  };

  const openArticle = async (sectionId: string, articleId: string) => {
    setArticleLoading(true);
    setActiveSectionId(sectionId);
    setActiveArticle(null);
    try {
      const article = await api.getGuideArticle(sectionId, articleId);
      setActiveArticle(article);
      const [recentData] = await Promise.all([
        api.getGuideRecentlyViewed(),
      ]);
      setRecentViews(recentData);
    } catch {
      toast.error('Failed to load article');
    } finally {
      setArticleLoading(false);
    }
  };

  const doSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const results = await api.searchGuide(q);
      setSearchResults(results);
      setSearchHistory(prev => {
        const next = [q, ...prev.filter(h => h !== q)].slice(0, 10);
        return next;
      });
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const toggleBookmark = async (sectionId: string, articleId: string, title: string) => {
    const existing = bookmarks.find(b => b.section_id === sectionId && b.article_id === articleId);
    try {
      if (existing) {
        const data = await api.removeGuideBookmark(sectionId, articleId);
        setBookmarks(data);
        toast.success('Bookmark removed');
      } else {
        const data = await api.addGuideBookmark(sectionId, articleId, title);
        setBookmarks(data);
        toast.success('Bookmark added');
      }
    } catch {
      toast.error('Failed to update bookmark');
    }
  };

  const isBookmarked = (sectionId: string, articleId: string) =>
    bookmarks.some(b => b.section_id === sectionId && b.article_id === articleId);

  const loadSection = async (sectionId: string) => {
    setActiveSectionId(sectionId);
    setActiveArticle(null);
    setSearchResults([]);
    setSearchQuery('');
    setIsSearching(false);
  };

  const handleSearchHistoryClick = (q: string) => {
    doSearch(q);
  };

  const clearSearchHistory = async () => {
    setSearchHistory([]);
  };

  const goBackToSections = () => {
    setActiveSectionId(null);
    setActiveArticle(null);
    setSearchResults([]);
    setSearchQuery('');
    setIsSearching(false);
  };

  const renderContentBlock = (block: { type: string; title: string; text: string; keys?: string; desc?: string }, index: number) => {
    const base = 'p-4 rounded-lg border';
    switch (block.type) {
      case 'step':
        return (
          <div key={index} className={`${base} bg-blue-500/5 border-blue-500/20 flex gap-3`}>
            <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
              {index + 1}
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-200 mb-1">{block.title}</h4>
              <p className="text-sm text-gray-400">{block.text}</p>
            </div>
          </div>
        );
      case 'tip':
        return (
          <div key={index} className={`${base} bg-yellow-500/5 border-yellow-500/20`}>
            <h4 className="text-sm font-medium text-yellow-400 mb-1">💡 {block.title}</h4>
            <p className="text-sm text-gray-400">{block.text}</p>
          </div>
        );
      case 'warn':
        return (
          <div key={index} className={`${base} bg-red-500/5 border-red-500/20`}>
            <h4 className="text-sm font-medium text-red-400 mb-1">⚠️ {block.title}</h4>
            <p className="text-sm text-gray-400">{block.text}</p>
          </div>
        );
      case 'info':
        return (
          <div key={index} className={`${base} bg-cyan-500/5 border-cyan-500/20`}>
            <h4 className="text-sm font-medium text-cyan-400 mb-1">ℹ️ {block.title}</h4>
            <p className="text-sm text-gray-400">{block.text}</p>
          </div>
        );
      case 'answer':
        return (
          <div key={index} className={`${base} bg-green-500/5 border-green-500/20`}>
            <h4 className="text-sm font-medium text-green-400 mb-1">{block.title}</h4>
            <p className="text-sm text-gray-400">{block.text}</p>
          </div>
        );
      case 'problem':
        return (
          <div key={index} className={`${base} bg-red-500/5 border-red-500/20`}>
            <h4 className="text-sm font-medium text-red-400 mb-1">🔴 {block.title}</h4>
            <p className="text-sm text-gray-400">{block.text}</p>
          </div>
        );
      case 'cause':
        return (
          <div key={index} className={`${base} bg-orange-500/5 border-orange-500/20`}>
            <h4 className="text-sm font-medium text-orange-400 mb-1">{block.title}</h4>
            <p className="text-sm text-gray-400">{block.text}</p>
          </div>
        );
      case 'fix':
        return (
          <div key={index} className={`${base} bg-green-500/5 border-green-500/20`}>
            <h4 className="text-sm font-medium text-green-400 mb-1">🔧 {block.title}</h4>
            <p className="text-sm text-gray-400">{block.text}</p>
          </div>
        );
      case 'link':
        return (
          <div key={index} className={`${base} bg-purple-500/5 border-purple-500/20`}>
            <h4 className="text-sm font-medium text-purple-400 mb-1">🔗 {block.title}</h4>
            <p className="text-sm text-gray-400">{block.text}</p>
          </div>
        );
      case 'shortcut':
        return (
          <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-surface-800 border border-surface-700">
            <kbd className="px-2 py-1 bg-surface-900 border border-surface-600 rounded text-xs text-minecraft-400 font-mono whitespace-nowrap">
              {block.keys}
            </kbd>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-gray-200">{block.title}</span>
              {block.desc && <p className="text-xs text-gray-500">{block.desc}</p>}
            </div>
          </div>
        );
      case 'purpose':
      case 'expected':
      case 'common_mistakes':
      case 'desc':
      case 'workflow':
      case 'architecture':
      case 'config':
      case 'reqs':
      case 'module':
      case 'feature':
      case 'version':
      case 'known':
      case 'future':
        return (
          <div key={index} className={`${base} bg-surface-800 border-surface-700`}>
            <h4 className="text-sm font-medium text-gray-200 mb-1">{block.title}</h4>
            <p className="text-sm text-gray-400">{block.text}</p>
          </div>
        );
      default:
        return (
          <div key={index} className={`${base} bg-surface-800 border-surface-700`}>
            <h4 className="text-sm font-medium text-gray-200 mb-1">{block.title}</h4>
            <p className="text-sm text-gray-400">{block.text}</p>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-minecraft-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0">
      {/* Left Sidebar - Section Navigation */}
      <div className="w-64 flex-shrink-0 border-r border-surface-800 flex flex-col bg-surface-900/50">
        {/* Search Bar */}
        <div className="p-3 border-b border-surface-800">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search guide..."
              value={searchQuery}
              onChange={(e) => doSearch(e.target.value)}
              className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-minecraft-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto">
          {/* Search Results */}
          {isSearching && searchResults.length > 0 && (
            <div className="p-2 space-y-0.5">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-gray-500">{searchResults.length} results</span>
                <Button variant="ghost" onClick={() => { setSearchQuery(''); setSearchResults([]); setIsSearching(false); }} className="text-xs">
                  <X size={14} />
                </Button>
              </div>
              {searchResults.slice(0, 20).map((r, i) => (
                <Button
                  key={`${r.sectionId}-${r.articleId}-${i}`}
                  variant="none"
                  onClick={() => openArticle(r.sectionId, r.articleId)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{r.sectionTitle}</span>
                    <ChevronRight size={10} className="text-gray-600" />
                  </div>
                  <p className="text-sm text-gray-200 font-medium truncate">{r.articleTitle}</p>
                  <p className="text-xs text-gray-500 truncate">{r.summary}</p>
                </Button>
              ))}
            </div>
          )}

          {/* Search History */}
          {!isSearching && searchQuery.length < 2 && searchHistory.length > 0 && (
            <div className="p-2">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Recent Searches</span>
                <Button variant="ghost" onClick={clearSearchHistory} className="text-xs">
                  <Trash2 size={12} />
                </Button>
              </div>
              {searchHistory.map((q, i) => (
                <Button
                  key={i}
                  variant="none"
                  onClick={() => handleSearchHistoryClick(q)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-800 rounded-lg transition-colors truncate"
                >
                  {q}
                </Button>
              ))}
            </div>
          )}

          {/* Bookmarks Button */}
          {!isSearching && (
            <div className="p-2">
              <Button
                variant="none"
                onClick={() => { setShowBookmarks(!showBookmarks); setShowRecent(false); }}
                className={`w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  showBookmarks ? 'bg-minecraft-500/10 text-minecraft-400' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-800'
                }`}
              >
                <Bookmark size={14} />
                <span>Bookmarks ({bookmarks.length})</span>
              </Button>
              {showBookmarks && (
                <div className="mt-1 ml-2 space-y-0.5">
                  {bookmarks.length === 0 ? (
                    <p className="text-xs text-gray-500 px-3 py-2">No bookmarks yet</p>
                  ) : (
                    bookmarks.map(b => (
                      <Button
                        key={b.id}
                        variant="none"
                        onClick={() => openArticle(b.section_id, b.article_id)}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-surface-800 rounded-lg transition-colors truncate"
                      >
                        {b.title}
                      </Button>
                    ))
                  )}
                </div>
              )}

              {/* Recently Viewed Button */}
              <Button
                variant="none"
                onClick={() => { setShowRecent(!showRecent); setShowBookmarks(false); }}
                className={`w-full px-3 py-2 rounded-lg text-sm transition-colors mt-1 ${
                  showRecent ? 'bg-minecraft-500/10 text-minecraft-400' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-800'
                }`}
              >
                <Clock size={14} />
                <span>Recently Viewed</span>
              </Button>
              {showRecent && (
                <div className="mt-1 ml-2 space-y-0.5">
                  {recentViews.length === 0 ? (
                    <p className="text-xs text-gray-500 px-3 py-2">No recently viewed articles</p>
                  ) : (
                    recentViews.map((r, i) => (
                      <Button
                        key={`${r.section_id}-${r.article_id}-${i}`}
                        variant="none"
                        onClick={() => openArticle(r.section_id, r.article_id)}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-surface-800 rounded-lg transition-colors truncate"
                      >
                        {r.title}
                      </Button>
                    ))
                  )}
                </div>
              )}

              {/* Auto-Detections */}
              {detections.length > 0 && (
                <div className="mt-3 px-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={12} className="text-red-400" />
                    <span className="text-xs text-red-400 font-medium">Detected Issues</span>
                  </div>
                  {detections.map((d, i) => (
                    <Button
                      key={i}
                      variant="none"
                      onClick={() => openArticle(d.sectionId, d.articleId)}
                      className="w-full text-left px-3 py-2 mb-1 rounded-lg bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-colors"
                    >
                      <p className="text-xs text-gray-200 font-medium">{d.title}</p>
                      <p className="text-[11px] text-gray-500">{d.detail}</p>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section List */}
          {!isSearching && searchQuery.length < 2 && (
            <div className="p-2 space-y-0.5">
              {Object.values(sections).map(section => {
                const Icon = SECTION_ICONS[section.id] || BookOpen;
                const colorClass = SECTION_COLORS[section.id] || 'text-gray-400 bg-surface-800 border-surface-700';
                const isActive = activeSectionId === section.id && !activeArticle;
                return (
                  <Button
                    key={section.id}
                    variant="none"
                    onClick={() => loadSection(section.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors gap-3 ${
                      isActive
                        ? 'bg-minecraft-500/10 text-minecraft-400 border border-minecraft-500/20'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-surface-800'
                    }`}
                  >
                    <Icon size={16} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{section.title}</p>
                      <p className="text-[11px] text-gray-500">{section.articleCount} articles</p>
                    </div>
                    <ChevronRight size={12} className="text-gray-600 flex-shrink-0" />
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Breadcrumb / Back */}
        {(activeSectionId || activeArticle) && (
          <Button variant="ghost" onClick={goBackToSections} className="gap-1.5 text-xs mb-4">
            <ArrowLeft size={14} />
            <span>All Sections</span>
          </Button>
        )}

        {/* Section Article List */}
        {activeSectionId && !activeArticle && !articleLoading && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              {(() => {
                const Icon = SECTION_ICONS[activeSectionId] || BookOpen;
                return <Icon size={24} className="text-minecraft-400" />;
              })()}
              <div>
                <h2 className="text-xl font-bold text-gray-100">{sections[activeSectionId]?.title || 'Guide'}</h2>
                <p className="text-sm text-gray-500">{sections[activeSectionId]?.articleCount || 0} articles</p>
              </div>
            </div>

            {/* Auto-detected issues at top of troubleshooting section */}
            {activeSectionId === 'troubleshooting' && detections.length > 0 && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Detected Issues
                </h3>
                <div className="space-y-2">
                  {detections.map((d, i) => (
                    <Button
                      key={i}
                      variant="none"
                      onClick={() => openArticle(d.sectionId, d.articleId)}
                      className="w-full text-left p-3 rounded-lg bg-surface-800 border border-surface-700 hover:border-red-500/30 transition-colors"
                    >
                      <p className="text-sm text-gray-200 font-medium">{d.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{d.detail}</p>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sections[activeSectionId]?.articles.map(article => (
                <Button
                  key={article.id}
                  variant="none"
                  onClick={() => openArticle(activeSectionId, article.id)}
                  className="card-hover text-left group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-200 group-hover:text-minecraft-400 transition-colors">
                        {article.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">{article.summary}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-600 group-hover:text-minecraft-400 flex-shrink-0 mt-1 transition-colors" />
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Article Viewer */}
        {articleLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-minecraft-500 border-t-transparent" />
          </div>
        )}

        {activeArticle && !articleLoading && (
          <div className="max-w-3xl">
            {/* Article Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                  <span>{activeArticle.section.title}</span>
                  <ChevronRight size={10} />
                  <span className="text-gray-400">{activeArticle.article.title}</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-100">{activeArticle.article.title}</h2>
                <p className="text-sm text-gray-500 mt-1">{activeArticle.article.summary}</p>
              </div>
              <Button variant="ghost" onClick={() => toggleBookmark(activeArticle.section.id, activeArticle.article.id, activeArticle.article.title)}
                className={`p-2 rounded-lg ${isBookmarked(activeArticle.section.id, activeArticle.article.id) ? 'bg-yellow-500/10 text-yellow-400' : 'bg-surface-800 text-gray-500 hover:text-gray-300'}`}
                title={isBookmarked(activeArticle.section.id, activeArticle.article.id) ? 'Remove bookmark' : 'Add bookmark'}
              >
                <Star size={16} fill={isBookmarked(activeArticle.section.id, activeArticle.article.id) ? 'currentColor' : 'none'} />
              </Button>
            </div>

            {/* Content Blocks */}
            <div className="space-y-3 mb-8">
              {activeArticle.article.content.map((block, i) => renderContentBlock(block, i))}
            </div>

            {/* Related Articles */}
            {activeArticle.article.related && activeArticle.article.related.length > 0 && (
              <div className="mt-8 pt-6 border-t border-surface-800">
                <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                  <ExternalLink size={14} />
                  Related Articles
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeArticle.article.related.map((rel, i) => (
                    <Button
                      key={i}
                      variant="none"
                      onClick={() => openArticle(rel.sectionId, rel.articleId)}
                      className="text-left p-3 rounded-lg bg-surface-800 border border-surface-700 hover:border-minecraft-500/30 transition-colors flex-col items-start"
                    >
                      <p className="text-xs text-gray-500">{rel.sectionTitle}</p>
                      <p className="text-sm text-gray-200 font-medium mt-0.5">{rel.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{rel.summary}</p>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Default landing view - no section selected */}
        {!activeSectionId && !activeArticle && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <BookOpen size={24} className="text-minecraft-400" />
              <div>
                <h2 className="text-xl font-bold text-gray-100">Guide & Knowledge Center</h2>
                <p className="text-sm text-gray-500">
                  Search, browse, and learn how to use MineControl OS
                </p>
              </div>
            </div>

            {/* Quick Start */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                <Rocket size={14} className="text-green-400" />
                Getting Started
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {sections.getting_started?.articles.slice(0, 6).map(a => (
                  <Button
                    key={a.id}
                    variant="none"
                    onClick={() => openArticle('getting_started', a.id)}
                    className="text-left p-3 rounded-lg bg-surface-800 border border-surface-700 hover:border-green-500/30 transition-colors flex-col items-start"
                  >
                    <p className="text-sm text-gray-200 font-medium">{a.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.summary}</p>
                  </Button>
                ))}
              </div>
            </div>

            {/* All Sections Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.values(sections).map(section => {
                const Icon = SECTION_ICONS[section.id] || BookOpen;
                const colorClass = SECTION_COLORS[section.id] || 'text-gray-400 bg-surface-800 border-surface-700';
                return (
                  <Button
                    key={section.id}
                    variant="none"
                    onClick={() => loadSection(section.id)}
                    className="card-hover text-left group flex-col items-start"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colorClass}`}>
                      <Icon size={18} />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-200 group-hover:text-minecraft-400 transition-colors">
                      {section.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">{section.articleCount} articles</p>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
