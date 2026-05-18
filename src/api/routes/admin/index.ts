import { Router } from 'express';
import auth from './auth';
import career from './career';
import hobby from './hobby';

export default (router: Router): Router => {
  auth(router);
  career(router);
  hobby(router);
  return router;
};
