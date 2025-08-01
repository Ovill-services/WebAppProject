export PGUSER=postgres
export PGDATABASE=Ovill
export PGPASSWORD=mysecretpassword
export PGPORT=5433
export PGHOST=localhost

psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE