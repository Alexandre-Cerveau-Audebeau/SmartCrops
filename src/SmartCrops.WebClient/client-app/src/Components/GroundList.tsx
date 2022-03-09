import * as React from 'react';
import GroundType from "../Models/GroundType";
import EditGroundModal from "./GroundModalEdit";
import AddGroundModal from "./GroundModalAdd";
import DeleteGroundModal from "./GroundModalDelete";

import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import useSWR from "swr";
import { Box } from '@mui/material';


  export default function DisplayGrounds() {

    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(10);

    const {data: groundTypes, error } = useSWR<GroundType[]>('/groundTypes', {refreshInterval:10000});

  
    const handleChangePage = (event: unknown, newPage: number) => {
      setPage(newPage);
    };
  
    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(+event.target.value);
      setPage(0);
    };

    if (error) return <p>Une Erreur est survenue</p>;

    if (!groundTypes) return <p>Chargement en cours</p>;
  
    return (
      <div>
        <Box sx={{my:2,mb:2}}>
          <AddGroundModal/>
        </Box>
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: '70%' }}>
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

                {groundTypes?.sort((grounda, groundb)  => grounda.id - groundb.id)
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
                            <p>
                              <EditGroundModal ground={ground}/>
                            </p>
                            <p>
                              <DeleteGroundModal ground={ground}/>
                            </p>
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
            count={groundTypes? groundTypes.length: 0}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Paper>
      </div>
    );
  }

