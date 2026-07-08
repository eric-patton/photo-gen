import { Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import GalleryPage from './components/gallery/GalleryPage';
import GeneratePage from './components/generate/GeneratePage';
import ImageDetailPage from './components/image/ImageDetailPage';
import InpaintEditorPage from './components/editor/InpaintEditorPage';
import GenerationDetailPage from './components/batch/GenerationDetailPage';
import CharactersPage from './components/characters/CharactersPage';
import CharacterBoardPage from './components/characters/CharacterBoardPage';
import CostsPage from './components/costs/CostsPage';
import SettingsPage from './components/settings/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<GalleryPage />} />
        <Route path="/generate" element={<GeneratePage />} />
        <Route path="/images/:id" element={<ImageDetailPage />} />
        <Route path="/images/:id/edit" element={<InpaintEditorPage />} />
        <Route path="/generations/:id" element={<GenerationDetailPage />} />
        <Route path="/characters" element={<CharactersPage />} />
        <Route path="/characters/:id" element={<CharacterBoardPage />} />
        <Route path="/costs" element={<CostsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
