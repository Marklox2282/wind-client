import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface NewsItem {
  id: number;
  title: string;
  excerpt: string;
  date: string;
  category: string;
}

const news: NewsItem[] = [
  { id: 1, title: 'Wind Client 1.0 Released', excerpt: 'First stable release with redesigned UI, real progress tracking and improved performance.', date: '2024-01-15', category: 'Release' },
  { id: 2, title: 'Minecraft 1.20.4 Support', excerpt: 'Full support for the latest Minecraft version with optimized native extraction.', date: '2024-01-10', category: 'Update' },
  { id: 3, title: 'New Mod Manager', excerpt: 'Drag-and-drop mods with automatic dependency resolution.', date: '2024-01-05', category: 'Feature' },
  { id: 4, title: 'Performance Improvements', excerpt: 'Faster startup, reduced memory use and smoother animations.', date: '2024-01-01', category: 'Update' },
];

export const News: React.FC = () => {
  return (
    <div className="h-full p-10 overflow-auto">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <div className="caption mb-2">News</div>
          <h1 className="text-2xl font-semibold tracking-tight">Updates & announcements</h1>
        </div>

        <div className="divide-y divide-ink-200 dark:divide-ink-800">
          {news.map((n) => (
            <article key={n.id} className="py-6 flex items-start gap-6 group">
              <div className="caption w-24 shrink-0 pt-1">{new Date(n.date).toISOString().slice(0, 10)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge">{n.category}</span>
                </div>
                <h2 className="text-base font-medium mb-1 tracking-tight text-ink-1000 dark:text-ink-0">
                  {n.title}
                </h2>
                <p className="text-sm text-ink-500 dark:text-ink-400 line-clamp-2">{n.excerpt}</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-ink-400 group-hover:text-ink-1000 dark:group-hover:text-ink-0 transition-colors shrink-0 mt-1" />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};
