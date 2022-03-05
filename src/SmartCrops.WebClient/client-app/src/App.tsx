import React from 'react';
import './App.css';

import ResponsiveAppBar from './Components/Navigation';
import Home from './Pages/Home';
import Account from './Pages/Account';
import Library from './Pages/Library';
import PlantsLibrary from './Pages/PlantsLibrary';
import GroundsLibrary from './Pages/GroundsLibrary';
import MyGardens from './Pages/MyGardens';
import ConnectedSensors from './Pages/ConnectedSensors';

import { SWRConfig } from 'swr'

import {BrowserRouter, Route, Routes} from 'react-router-dom';
import axios from 'axios';

function App() {
  return (
    <SWRConfig 
    value={{
      refreshInterval:0,
      fetcher:(url)=>axios.get(`https://localhost:7137/api${url}`).then(response => response.data)
    }}>
      
      <BrowserRouter>    

      <ResponsiveAppBar/>
      <Routes>
        <Route path='/' element={<Home />} />      
        <Route path='/account' element={<Account />} />
        <Route path='/library' element={<Library />} />
        <Route path='/myGardens' element={<MyGardens />} />
        <Route path='/connectedSensors' element={<ConnectedSensors />} />
        <Route path='/plantsLibrary' element={<PlantsLibrary />} />
        <Route path='/groundsLibrary' element={<GroundsLibrary />} />
      </Routes>

      </BrowserRouter>
    </SWRConfig>
  );
}

export default App;
