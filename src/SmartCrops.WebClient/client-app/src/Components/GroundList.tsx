import axios from "axios";
import * as React from 'react';
import GroundType from "../Models/GroundType";

import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import { Button } from "@mui/material";


  export default function DisplayGrounds() {

    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(10);

    const [grounds, setGrounds] = React.useState<GroundType[]>([]);
    async function displayGround() {
        let response = await axios.get<GroundType[]>('https://localhost:7137/api/groundTypes');
        setGrounds(response.data);
    }

    React.useEffect(() => {
        displayGround()
      },[]);


    const handleChangePage = (event: unknown, newPage: number) => {
      setPage(newPage);
    };
  
    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(+event.target.value);
      setPage(0);
    };
  
    return (
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 440 }}>
          <Table stickyHeader aria-label="sticky table">
            <TableHead>
              <TableRow>
                  <TableCell align='center'>
                    Id Sol
                  </TableCell>
                  <TableCell align='center'>
                    Nom Sol
                  </TableCell>
                  <TableCell align='center'>
                      Edit / Delete
                  </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {grounds
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map(ground => {
                  return (
                    <TableRow hover role="checkbox" tabIndex={-1} key={ground.id}>

                          <TableCell align='center'>
                              {ground.id}
                          </TableCell>

                          <TableCell align='center'>
                              {ground.groundName}
                          </TableCell>

                          <TableCell align='center'>
                            <Button >
                                Edit
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
          count={grounds.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
    );
  }

