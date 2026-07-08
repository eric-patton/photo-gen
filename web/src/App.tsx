import { Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import GalleryPage from './components/gallery/GalleryPage';
import GeneratePage from './components/generate/GeneratePage';
import CharactersPage from './components/characters/CharactersPage';
import CostsPage from './components/costs/CostsPage';
import SettingsPage from './components/settings/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<GalleryPage />} />
        <Route path="/generate" element={<GeneratePage />} />
        <Route path="/characters" element={<CharactersPage />} />
        <Route path="/costs" element={<CostsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
