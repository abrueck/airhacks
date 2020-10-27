# Build
mvn clean package && docker build -t com.airhacks/jkcon .

# RUN

docker rm -f jkcon || true && docker run -d -p 8080:8080 -p 4848:4848 --name jkcon com.airhacks/jkcon 

# System Test

Switch to the "-st" module and perform:

mvn compile failsafe:integration-test