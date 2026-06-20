app.schemas
===========

Pydantic request / response models. The custom validators here are
the first line of input sanitisation — see for instance the
:func:`~app.schemas.auth.RegisterRequest.username_valid` validator
which delegates to the G96 username moderation layer.

.. automodule:: app.schemas.auth
   :members:

.. automodule:: app.schemas.admin
   :members:

.. automodule:: app.schemas.rankings
   :members:
