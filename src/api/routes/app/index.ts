import { Router } from 'express';
import profile from './profile';
import auth from './auth';


export default (router: Router): Router => {
  profile(router);
  auth(router);

  return router;
};
