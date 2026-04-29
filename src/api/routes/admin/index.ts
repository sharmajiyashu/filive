import { Router } from 'express';
import auth from './auth';


export default (router: Router): Router => {
  auth(router);
  return router;
};
