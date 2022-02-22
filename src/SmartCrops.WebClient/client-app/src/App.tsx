import React from 'react';
import './App.css';

import ResponsiveAppBar from './Components/Navigation';
import Home from './Pages/Home';
import Account from './Pages/Account';
import Library from './Pages/Library';
import MyGardens from './Pages/MyGardens';
import ConnectedSensors from './Pages/ConnectedSensors';

import {BrowserRouter, Route, Routes} from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>    

    <ResponsiveAppBar/>
    <Routes>
      <Route path='/' element={<Home />} />      
      <Route path='/account' element={<Account />} />
      <Route path='/library' element={<Library />} />
      <Route path='/myGardens' element={<MyGardens />} />
      <Route path='/connectedSensors' element={<ConnectedSensors />} />
    </Routes>

    </BrowserRouter>
  );
}

export default App;
