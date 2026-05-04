import { Router } from 'express';
import profile from './profile';
import auth from './auth';
import story from './story';
import social from './social';
import user from './user';


export default (router: Router): Router => {
  profile(router);
  auth(router);
  story(router);
  social(router);
  user(router);
  return router;
};
