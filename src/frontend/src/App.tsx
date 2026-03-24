import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Layout from './components/Layout/Layout';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import AuthCallback from './pages/AuthCallback';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import PlantDetail from './pages/PlantDetail';
import PlantLibrary from './pages/PlantLibrary';
import Register from './pages/Register';
import theme from './theme';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LanguageProvider>
      <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/library/:id" element={<PlantDetail />} />
            <Route path="/library" element={<PlantLibrary />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
      </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
