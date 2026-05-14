import { Router } from 'express';
import auth from './auth';
import career from './career';

export default (router: Router): Router => {
  auth(router);
  career(router);
  return router;
};
