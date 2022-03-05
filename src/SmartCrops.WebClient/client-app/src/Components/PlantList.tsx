import axios from "axios";
import * as React from 'react';
import PlantType from "../Models/PlantType";
import EditPlantModal from "./PlantModalEdit";
import AddPlantModal from "./PlantModalAdd";

import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Button from '@mui/material/Button'
import { Box } from "@mui/system";
import useSWR from "swr";


  export default function DisplayPlants() {

    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(10);
    
    const {data: plantTypes, error } = useSWR<PlantType[]>('/plantTypes', {refreshInterval:10000});


    const handleChangePage = (event: unknown, newPage: number) => {
      setPage(newPage);
    };
  
    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(+event.target.value);
      setPage(0);
    };

    if (error) return <p>Une Erreur est survenue</p>;

    if (!plantTypes) return <p>Chargement en cours</p>;
  
    return (
      <div>
        <Box sx={{my:2}}>
          <AddPlantModal/>
        </Box>
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>     
          <TableContainer sx={{ maxHeight: '70%' }}>
            <Table stickyHeader aria-label="sticky table">
              <TableHead>
                <TableRow>
                    <TableCell align='center'>
                        Id Plante
                    </TableCell>
                    <TableCell align='center'>
                        Nom Plante
                    </TableCell>
                    <TableCell align='center'>
                        Edit / Delete
                    </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {plantTypes?.sort((planta, plantb)  => planta.id - plantb.id)
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map(plant => {
                    return (
                      <TableRow hover role="checkbox" tabIndex={-1} key={plant.id}>

                            <TableCell align='center'>
                                {plant.id}
                            </TableCell>

                            <TableCell align='center'>
                                {plant.plantName}
                            </TableCell>

                            <TableCell align='center'>

                              <Button >
                                  <EditPlantModal plant={plant} />
                              </Button>

                              <Button >
                                  Delete
                              </Button>

                            </TableCell>

                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[10, 25, 100]}
            component="div"
            count={plantTypes? plantTypes.length: 0}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />

        </Paper>
      </div>
      
    );
  }